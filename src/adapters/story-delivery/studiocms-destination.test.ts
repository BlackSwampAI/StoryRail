import { describe, expect, it } from "vitest";

import type { DeliveryRequest } from "@/application/story-deliveries";
import { articleRevisionId, storyId, type SiteDestinationSettings } from "@/domain/editorial";

import { createStudioCmsDestination } from "./studiocms-destination";

const SETTINGS: Extract<SiteDestinationSettings, { kind: "studiocms" }> = {
  kind: "studiocms",
  baseUrl: "https://newsroom.test/studiocms_api/rest/v1",
  package: "studiocms/markdown",
  draft: true,
};

const CREATED = "Page created successfully with id: 426bfa0f-1c3d-4f1e-9a5b-7c2d0e8f1234";

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
    { kind: "context", markdown: "The vote was unanimous.", citations: [] },
  ],
  draft: true,
};

/** A fixture, never the network: no test here is allowed to reach a real install. */
function fixture(response: Response | (() => never)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImplementation = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (typeof response === "function") response();
    return response;
  }) as unknown as typeof globalThis.fetch;
  return { calls, fetchImplementation };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("delivering to a StudioCMS install", () => {
  it("learns which page it made from the message, because nothing else says", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { message: CREATED }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toEqual({
      ok: true,
      remoteId: "426bfa0f-1c3d-4f1e-9a5b-7c2d0e8f1234",
      result: { status: 200, message: CREATED },
    });
    expect(calls[0]?.url).toBe("https://newsroom.test/studiocms_api/rest/v1/pages");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("sends what the destination reads and nothing it would throw away", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { message: CREATED }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await destination.deliver(REQUEST);

    const sent = JSON.parse(String(calls[0]?.init.body));
    expect(sent).toEqual({
      data: {
        title: "Council Approves the Harbour Plan",
        description: "After two years of hearings.",
        slug: "council-approves-the-harbour-plan",
        package: "studiocms/markdown",
        contentLang: "default",
        // Booleans cross the wire as numbers; a JSON true is answered with a bare 400.
        draft: 1,
        showOnNav: 0,
        showAuthor: 0,
        showContributors: 0,
        // These decode from a JSON string at the far end, and columns left out fail the insert.
        categories: "[]",
        tags: "[]",
        contributorIds: "[]",
        augments: "[]",
        heroImage: "",
        parentFolder: null,
      },
      content: { content: "## Council Approves the Harbour Plan\n\nThe vote was unanimous." },
    });
    // An id, an author, and a publication date are all discarded at the far end, so sending them
    // would only make this look like it decided things it does not decide.
    expect(Object.keys(sent.data)).not.toContain("id");
    expect(Object.keys(sent.data)).not.toContain("authorId");
    expect(Object.keys(sent.data)).not.toContain("publishedAt");
  });

  it("changes the page it already made rather than making a second one", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { message: "Page updated" }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    // An update knows the page from the prior delivery, so it needs nothing from the answer.
    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "page-1" }),
    ).resolves.toMatchObject({ ok: true, remoteId: "page-1" });
    expect(calls[0]?.url).toBe("https://newsroom.test/studiocms_api/rest/v1/pages/page-1");
    expect(calls[0]?.init.method).toBe("PATCH");
    expect(JSON.parse(String(calls[0]?.init.body)).data.draft).toBe(1);
  });

  it("reports a create with no readable ID as unknown", async () => {
    // A success naming nothing would make the next Revision create a second page.
    const { fetchImplementation } = fixture(json(200, { message: "Page created" }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" },
    });
  });

  it("delivers as a draft so no run can put itself in front of readers", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { message: CREATED }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    expect(destination.draft).toBe(true);
    await destination.deliver(REQUEST);
    expect(JSON.parse(String(calls[0]?.init.body)).data.draft).toBe(1);
  });

  it("distinguishes a refused credential from a refused page", async () => {
    for (const [status, code] of [
      [401, "DESTINATION_UNAUTHORIZED"],
      [403, "DESTINATION_UNAUTHORIZED"],
      [409, "DESTINATION_REJECTED"],
      [422, "DESTINATION_REJECTED"],
      // An install that answered 500 answered. Recording that as "unreachable" sent an operator
      // looking at the network for a fault the far end had already reported.
      [500, "DESTINATION_REJECTED"],
      [429, "DESTINATION_UNREACHABLE"],
    ] as const) {
      const { fetchImplementation } = fixture(json(status, { message: "No." }));
      const destination = createStudioCmsDestination({
        settings: SETTINGS,
        apiToken: "token-1",
        fetch: fetchImplementation,
      });
      await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
        ok: false,
        failure: { code },
      });
    }
  });

  it("reports an install it could not reach at all", async () => {
    const { fetchImplementation } = fixture(() => {
      throw new Error("connect ECONNREFUSED");
    });
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: {
        code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
        message: "connect ECONNREFUSED",
      },
    });
  });

  it("reports an unreadable successful answer as unknown", async () => {
    const { fetchImplementation } = fixture(
      new Response("<html>Something went sideways</html>", { status: 200 }),
    );
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" },
    });
  });

  it("treats a successful unreadable update as unknown too", async () => {
    const { fetchImplementation } = fixture(new Response("Saved", { status: 200 }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "page-1" }),
    ).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" },
    });
  });

  it("keeps the credential out of everything but the request it authorises", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { message: CREATED }));
    const destination = createStudioCmsDestination({
      settings: SETTINGS,
      apiToken: "token-1",
      fetch: fetchImplementation,
    });

    const attempt = await destination.deliver(REQUEST);

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer token-1");
    expect(JSON.stringify(attempt)).not.toContain("token-1");
  });
});
