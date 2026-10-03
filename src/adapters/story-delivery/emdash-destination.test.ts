import { describe, expect, it } from "vitest";

import type { DeliveryRequest } from "@/application/story-deliveries";
import { articleRevisionId, storyId, type SiteDestinationSettings } from "@/domain/editorial";

import { createEmDashDestination } from "./emdash-destination";

const SETTINGS: Extract<SiteDestinationSettings, { kind: "emdash" }> = {
  kind: "emdash",
  baseUrl: "https://newsroom.test/_emdash/api",
  collection: "posts",
  draft: true,
};

const REQUEST: DeliveryRequest = {
  storyId: storyId("story-1"),
  revisionId: articleRevisionId("revision-1"),
  operation: "create",
  remoteId: null,
  slug: "council-approves-the-harbour-plan",
  headline: "Council Approves the Harbour Plan",
  dek: "After two years of hearings.",
  bodyMarkdown: "## Council Approves the Harbour Plan\n\nThe vote was unanimous.",
  blocks: [
    { kind: "heading", markdown: "Council Approves the Harbour Plan", citations: [] },
    {
      kind: "claim",
      markdown: "The vote was **unanimous**. See [the minutes](https://example.test/minutes).",
      citations: [],
    },
    { kind: "context", markdown: "Hearings ran for two years.", citations: [] },
  ],
  draft: true,
};

type Call = { url: string; init: RequestInit };

function fixture(responses: readonly (Response | (() => never))[]) {
  const calls: Call[] = [];
  const fetchImplementation = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const response = responses[calls.length - 1];
    if (typeof response === "function") response();
    if (!response) throw new Error("Unexpected EmDash request in test fixture.");
    return response;
  }) as typeof globalThis.fetch;
  return { calls, fetchImplementation };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function item(id = "item-1", overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      item: { id, type: "posts", slug: REQUEST.slug, status: "draft", ...overrides },
      _rev: "rev-1",
    },
  };
}

function sent(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

describe("delivering to EmDash", () => {
  it("creates a draft in the selected collection with title, excerpt, and Portable Text", async () => {
    const { calls, fetchImplementation } = fixture([json(201, item())]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "private-token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toEqual({
      ok: true,
      remoteId: "item-1",
      result: { status: 201, message: "Saved draft EmDash item item-1." },
    });
    expect(destination.name).toBe("emdash");
    expect(calls[0]?.url).toBe("https://newsroom.test/_emdash/api/content/posts");
    expect(calls[0]?.init.method).toBe("POST");
    expect(new Headers(calls[0]?.init.headers).get("Authorization")).toBe("Bearer private-token");
    expect(sent(calls[0]!)).toEqual({
      data: {
        title: "Council Approves the Harbour Plan",
        excerpt: "After two years of hearings.",
        content: [
          {
            _type: "block",
            _key: "storyrail-block-0",
            style: "h2",
            children: [
              {
                _type: "span",
                _key: "storyrail-span-0",
                text: "Council Approves the Harbour Plan",
                marks: [],
              },
            ],
            markDefs: [],
          },
          {
            _type: "block",
            _key: "storyrail-block-1",
            style: "normal",
            children: [
              {
                _type: "span",
                _key: "storyrail-span-1",
                text: "The vote was **unanimous**. See [the minutes](https://example.test/minutes).",
                marks: [],
              },
            ],
            markDefs: [],
          },
          {
            _type: "block",
            _key: "storyrail-block-2",
            style: "normal",
            children: [
              {
                _type: "span",
                _key: "storyrail-span-2",
                text: "Hearings ran for two years.",
                marks: [],
              },
            ],
            markDefs: [],
          },
        ],
      },
      slug: REQUEST.slug,
      status: "draft",
    });
  });

  it("records a slug EmDash assigned when it differs from the requested slug", async () => {
    const { fetchImplementation } = fixture([
      json(201, item("item-2", { slug: "council-approves-the-harbour-plan-2" })),
    ]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: true,
      remoteId: "item-2",
      result: {
        requestedSlug: REQUEST.slug,
        assignedSlug: "council-approves-the-harbour-plan-2",
      },
    });
  });

  it("fetches the revision before update and omits status so a published item stays published", async () => {
    const { calls, fetchImplementation } = fixture([
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "published" },
          _rev: "read-token",
        },
      }),
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "published" },
          _rev: "saved-token",
        },
      }),
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "published" },
          _rev: "published-token",
        },
      }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({ ok: true, remoteId: "item-1" });
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ["GET", "https://newsroom.test/_emdash/api/content/posts/item-1"],
      ["PUT", "https://newsroom.test/_emdash/api/content/posts/item-1"],
      ["POST", "https://newsroom.test/_emdash/api/content/posts/item-1/publish"],
    ]);
    expect(sent(calls[1]!)).toEqual({
      data: {
        title: REQUEST.headline,
        excerpt: REQUEST.dek,
        content: expect.any(Array),
      },
      slug: REQUEST.slug,
      _rev: "read-token",
    });
    expect(sent(calls[1]!)).not.toHaveProperty("status");
    expect(sent(calls[2]!)).toEqual({ _rev: "saved-token" });
  });

  it("updates a published item without calling publish when draft mode is selected", async () => {
    const { calls, fetchImplementation } = fixture([
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "published" },
          _rev: "read-token",
        },
      }),
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "published" },
          _rev: "saved-token",
        },
      }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: true },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({
      ok: true,
      result: { message: "Saved draft changes to EmDash item item-1." },
    });
    expect(calls.map((call) => call.init.method)).toEqual(["GET", "PUT"]);
    expect(sent(calls[1]!)).not.toHaveProperty("status");
  });

  it("stops after an update conflict without writing or publishing", async () => {
    const { calls, fetchImplementation } = fixture([
      json(409, { success: false, error: { message: "The item changed." } }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("stops after the update write conflicts, without publishing", async () => {
    const { calls, fetchImplementation } = fixture([
      json(200, {
        success: true,
        data: {
          item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "draft" },
          _rev: "read-token",
        },
      }),
      json(409, { success: false, error: { message: "The item changed." } }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({ ok: false });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init.method).toBe("PUT");
  });

  it("returns an ordinary unreachable failure when the pre-update read cannot connect", async () => {
    const { fetchImplementation } = fixture([
      () => {
        throw new Error("network unavailable");
      },
    ]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({ ok: false, failure: { code: "DESTINATION_UNREACHABLE" } });
  });

  it("does not write when the current item lacks a revision", async () => {
    const { calls, fetchImplementation } = fixture([
      json(200, {
        success: true,
        data: { item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "draft" } },
      }),
    ]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "item-1" }),
    ).resolves.toMatchObject({
      ok: false,
      failure: { code: "DESTINATION_RESPONSE_INVALID" },
    });
    expect(calls).toHaveLength(1);
  });

  it("marks a create transport error as an unknown outcome", async () => {
    const { fetchImplementation } = fixture([
      () => {
        throw new Error("connection reset");
      },
    ]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN" },
    });
  });

  it("rejects an unauthorized create without claiming that an item was saved", async () => {
    const { fetchImplementation } = fixture([
      json(401, { success: false, error: { message: "Unauthorized." } }),
    ]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: false,
      failure: { code: "DESTINATION_UNAUTHORIZED" },
    });
  });

  it("keeps the item identity when publish transport fails after a saved revision", async () => {
    const { calls, fetchImplementation } = fixture([
      json(201, item("item-1", { status: "draft" })),
      () => {
        throw new Error("connection reset");
      },
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: {
        code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
        message: expect.stringContaining("item-1"),
      },
    });
    expect(calls).toHaveLength(2);
  });

  it("marks malformed successful responses as unverifiable", async () => {
    const { fetchImplementation } = fixture([json(201, { success: true, data: {} })]);
    const destination = createEmDashDestination({
      settings: SETTINGS,
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" },
    });
  });

  it("retains the saved item identity when publishing cannot be confirmed", async () => {
    const { calls, fetchImplementation } = fixture([
      json(201, item()),
      json(503, { success: false, error: { message: "Try again later." } }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: {
        code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
        message: expect.stringContaining("item-1"),
      },
    });
    expect(calls).toHaveLength(2);
    expect(new Headers(calls[1]?.init.headers).get("Authorization")).toBe("Bearer token");
  });

  it("does not publish when the create response has no revision token", async () => {
    const { calls, fetchImplementation } = fixture([
      json(201, {
        success: true,
        data: { item: { id: "item-1", type: "posts", slug: REQUEST.slug, status: "draft" } },
      }),
    ]);
    const destination = createEmDashDestination({
      settings: { ...SETTINGS, draft: false },
      apiToken: "token",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: {
        code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE",
        message: expect.stringContaining("item-1"),
      },
    });
    expect(calls).toHaveLength(1);
  });
});
