import { describe, expect, it } from "vitest";

import type { DeliveryRequest } from "@/application/story-deliveries";
import { articleRevisionId, storyId, type SiteDestinationSettings } from "@/domain/editorial";

import { createWordPressDestination } from "./wordpress-destination";

const SETTINGS: Extract<SiteDestinationSettings, { kind: "wordpress" }> = {
  kind: "wordpress",
  baseUrl: "https://newsroom.test",
  username: "storyrail",
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
    { kind: "claim", markdown: "The vote was unanimous.", citations: [] },
    { kind: "context", markdown: "Hearings ran for two years.", citations: [] },
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

function created(overrides: Record<string, unknown> = {}): Response {
  return json(201, { id: 4711, slug: REQUEST.slug, status: "draft", ...overrides });
}

function sent(calls: { init: RequestInit }[]): Record<string, string> {
  return JSON.parse(String(calls[0]?.init.body)) as Record<string, string>;
}

describe("delivering to a WordPress install", () => {
  it("sends the Article as separate Gutenberg blocks rather than one lump of prose", async () => {
    const { calls, fetchImplementation } = fixture(created());
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await destination.deliver(REQUEST);

    expect(sent(calls).content).toBe(
      [
        '<!-- wp:heading {"level":2} -->',
        "<h2>Council Approves the Harbour Plan</h2>",
        "<!-- /wp:heading -->",
        "",
        "<!-- wp:paragraph -->",
        "<p>The vote was unanimous.</p>",
        "<!-- /wp:paragraph -->",
        "",
        "<!-- wp:paragraph -->",
        "<p>Hearings ran for two years.</p>",
        "<!-- /wp:paragraph -->",
      ].join("\n"),
    );
  });

  it("escapes prose that would otherwise be read as markup", async () => {
    const { calls, fetchImplementation } = fixture(created());
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await destination.deliver({
      ...REQUEST,
      blocks: [{ kind: "context", markdown: "Ports & Harbours said <not> a word.", citations: [] }],
    });

    expect(sent(calls).content).toContain("<p>Ports &amp; Harbours said &lt;not&gt; a word.</p>");
  });

  it("learns which post it made from the answer WordPress sends back", async () => {
    const { calls, fetchImplementation } = fixture(created());
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toEqual({
      ok: true,
      remoteId: "4711",
      result: { status: 201, message: null },
    });
    expect(calls[0]?.url).toBe("https://newsroom.test/wp-json/wp/v2/posts");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("updates the post a prior delivery made instead of creating a second one", async () => {
    const { calls, fetchImplementation } = fixture(json(200, { id: 4711, slug: REQUEST.slug }));
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await expect(
      destination.deliver({ ...REQUEST, operation: "update", remoteId: "4711" }),
    ).resolves.toMatchObject({ ok: true, remoteId: "4711" });
    expect(calls[0]?.url).toBe("https://newsroom.test/wp-json/wp/v2/posts/4711");
    // WordPress has no PATCH route for a post; sending one answers as though it did not exist.
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("records both slugs when WordPress quietly publishes to a different address", async () => {
    const { fetchImplementation } = fixture(
      created({ slug: "council-approves-the-harbour-plan-2" }),
    );
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    // The post exists, so this is a success. Calling it failed would leave a record unable to
    // say what happened to a page that is on a website.
    await expect(destination.deliver(REQUEST)).resolves.toEqual({
      ok: true,
      remoteId: "4711",
      result: {
        status: 201,
        message: null,
        requestedSlug: "council-approves-the-harbour-plan",
        assignedSlug: "council-approves-the-harbour-plan-2",
      },
    });
  });

  it("publishes as a draft, or live, exactly as the newsroom configured it", async () => {
    for (const [draft, status] of [
      [true, "draft"],
      [false, "publish"],
    ] as const) {
      const { calls, fetchImplementation } = fixture(created());
      const destination = createWordPressDestination({
        settings: { ...SETTINGS, draft },
        applicationPassword: "abcd efgh ijkl",
        fetch: fetchImplementation,
      });

      await destination.deliver(REQUEST);
      expect(sent(calls).status).toBe(status);
      expect(destination.draft).toBe(draft);
    }
  });

  it("sends the headline, the dek and the chosen slug, and never a date of its own", async () => {
    const { calls, fetchImplementation } = fixture(created());
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await destination.deliver(REQUEST);

    const body = sent(calls);
    expect(body.title).toBe("Council Approves the Harbour Plan");
    expect(body.excerpt).toBe("After two years of hearings.");
    expect(body.slug).toBe("council-approves-the-harbour-plan");
    expect(body).not.toHaveProperty("date");
  });

  it("distinguishes an install that refused the post from one that could not answer", async () => {
    for (const [status, code] of [
      [401, "DESTINATION_UNAUTHORIZED"],
      [403, "DESTINATION_UNAUTHORIZED"],
      [400, "DESTINATION_REJECTED"],
      // A server that answered 500 answered. Only a status meaning "come back later" reads as
      // an install that could not be reached.
      [500, "DESTINATION_REJECTED"],
      [408, "DESTINATION_UNREACHABLE"],
      [429, "DESTINATION_UNREACHABLE"],
    ] as const) {
      const { fetchImplementation } = fixture(json(status, { code: "rest_error", message: "No." }));
      const destination = createWordPressDestination({
        settings: SETTINGS,
        applicationPassword: "abcd efgh ijkl",
        fetch: fetchImplementation,
      });
      await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
        ok: false,
        failure: { code, message: "No." },
      });
    }
  });

  it("reports an install it could not reach at all", async () => {
    const { fetchImplementation } = fixture(() => {
      throw new Error("connect ECONNREFUSED");
    });
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
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

  it("refuses to call an answer naming no post a delivery that worked", async () => {
    const { fetchImplementation } = fixture(json(201, { slug: REQUEST.slug }));
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({
      ok: null,
      uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE" },
    });
  });

  it("keeps a non-success response a failure even when its body is unreadable", async () => {
    const { fetchImplementation } = fixture(new Response("bad gateway", { status: 502 }));
    const destination = createWordPressDestination({
      settings: SETTINGS,
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    await expect(destination.deliver(REQUEST)).resolves.toMatchObject({ ok: false });
  });

  it("authenticates as the configured user and keeps the password out of the record", async () => {
    const { calls, fetchImplementation } = fixture(created());
    const destination = createWordPressDestination({
      settings: SETTINGS,
      // Application Passwords are displayed with spaces and WordPress accepts them either way,
      // so the stored secret is sent exactly as it was given.
      applicationPassword: "abcd efgh ijkl",
      fetch: fetchImplementation,
    });

    const attempt = await destination.deliver(REQUEST);

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("storyrail:abcd efgh ijkl", "utf8").toString("base64")}`,
    );
    expect(JSON.stringify(attempt)).not.toContain("abcd efgh ijkl");
  });
});
