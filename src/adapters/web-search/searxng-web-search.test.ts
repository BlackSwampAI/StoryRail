import { describe, expect, it, vi } from "vitest";

import type { SiteSearchSettings } from "@/domain/editorial";

import { createSearxngWebSearch } from "./searxng-web-search";

const SETTINGS: SiteSearchSettings = {
  baseUrl: "https://search.newsroom.test",
  username: "storyrail",
};

const PASSWORD = "correct-horse-battery-staple";

function answering(response: Response | (() => never)) {
  return vi.fn(async (): Promise<Response> => {
    if (typeof response === "function") return response();
    return response;
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function searchWith(fetchImplementation: ReturnType<typeof answering>) {
  return createSearxngWebSearch({
    settings: SETTINGS,
    password: PASSWORD,
    fetch: fetchImplementation as unknown as typeof globalThis.fetch,
  });
}

describe("SearXNG web search", () => {
  it("asks for JSON at the configured instance and authenticates as the configured user", async () => {
    const fetchImplementation = answering(json({ results: [] }));

    await searchWith(fetchImplementation).search({ terms: "mac studio m5", limit: 8 });

    const [url, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://search.newsroom.test/search?q=mac%20studio%20m5&format=json");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from(`storyrail:${PASSWORD}`, "utf8").toString("base64")}`,
    );
  });

  it("reads back the title, address and snippet of every candidate", async () => {
    const fetchImplementation = answering(
      json({
        results: [
          {
            title: "Mac Studio, reviewed",
            url: "https://example.test/review",
            content: "The unified memory package is the story.",
            engine: "duckduckgo",
            category: "general",
          },
        ],
      }),
    );

    await expect(
      searchWith(fetchImplementation).search({ terms: "mac studio", limit: 8 }),
    ).resolves.toEqual({
      ok: true,
      results: [
        {
          title: "Mac Studio, reviewed",
          url: "https://example.test/review",
          snippet: "The unified memory package is the story.",
          engine: "duckduckgo",
        },
      ],
    });
  });

  it("stops reading once it has as many candidates as it was asked for", async () => {
    const fetchImplementation = answering(
      json({
        results: Array.from({ length: 20 }, (_, index) => ({
          title: `Candidate ${index}`,
          url: `https://example.test/${index}`,
          content: "A snippet.",
        })),
      }),
    );

    const found = await searchWith(fetchImplementation).search({ terms: "mac studio", limit: 8 });

    expect(found.ok && found.results).toHaveLength(8);
  });

  it("reports a rejected credential as a rejected credential", async () => {
    const found = await searchWith(answering(new Response("", { status: 401 }))).search({
      terms: "mac studio",
      limit: 8,
    });

    expect(found).toMatchObject({
      ok: false,
      failure: { code: "SEARCH_CREDENTIALS_REJECTED", retryable: false },
    });
    expect(found.ok || found.failure.message).toContain("credentials");
  });

  it("names search.formats when an instance refuses to answer in JSON", async () => {
    // A 403 here is not an authorisation problem, and an operator told only that search failed
    // spends an afternoon on the password instead of on the one line that fixes it.
    const found = await searchWith(answering(new Response("", { status: 403 }))).search({
      terms: "mac studio",
      limit: 8,
    });

    expect(found).toMatchObject({
      ok: false,
      failure: { code: "SEARCH_JSON_FORMAT_DISABLED", retryable: false },
    });
    expect(found.ok || found.failure.message).toContain("search.formats");
  });

  it("reports an instance that never answered as unreachable", async () => {
    const found = await searchWith(
      answering(() => {
        throw new TypeError("fetch failed");
      }),
    ).search({ terms: "mac studio", limit: 8 });

    expect(found).toMatchObject({
      ok: false,
      failure: { code: "SEARCH_UNREACHABLE", retryable: true },
    });
  });

  it("refuses an answer that is not a list of results rather than reporting none", async () => {
    const found = await searchWith(answering(json({ error: "no engines" }))).search({
      terms: "mac studio",
      limit: 8,
    });

    expect(found).toMatchObject({ ok: false, failure: { code: "SEARCH_RESPONSE_INVALID" } });
  });

  it.each([
    ["a rejected credential", new Response("", { status: 401 })],
    ["a refused format", new Response("", { status: 403 })],
    ["a server error", new Response(PASSWORD, { status: 500 })],
    ["an unreadable body", new Response("not json", { status: 200 })],
  ])("never puts the password in what it says about %s", async (_case, response) => {
    const found = await searchWith(answering(response)).search({ terms: "mac studio", limit: 8 });

    expect(found.ok).toBe(false);
    expect(JSON.stringify(found)).not.toContain(PASSWORD);
  });
});
