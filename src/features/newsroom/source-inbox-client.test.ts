import { describe, expect, it, vi } from "vitest";

import { createSourceInboxClient } from "./source-inbox-client";

const actor = { type: "operator", operatorId: "operator-24" } as const;
const source = {
  id: "source/a b",
  type: "url",
  submittedUrl: "https://example.com/report",
  canonicalUrl: "https://example.com/report",
  submittedBy: actor,
  receivedAt: "opaque-time",
} as const;
const extraction = {
  id: "extraction-24",
  sourceId: source.id,
  extractor: { key: "provider", version: "1" },
  requestedBy: actor,
  startedAt: "opaque-start",
  completedAt: "opaque-complete",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Persisted",
    title: "Title",
    byline: null,
    publishedAt: null,
    language: null,
  },
} as const;

describe("sourceInboxClient", () => {
  it("performs the exact inbox GET and strictly restores extraction evidence", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, sources: [{ source, extractions: [extraction] }] }),
          {
            status: 200,
          },
        ),
    );
    const result = await createSourceInboxClient(fetch).listPendingSources();
    expect(fetch).toHaveBeenCalledWith("/api/source-inbox", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual({ kind: "completed", value: [{ source, extractions: [extraction] }] });
  });

  it("performs the exact triage PUT without browser provenance or timestamp", async () => {
    const triageDecision = {
      sourceId: source.id,
      decision: "skip",
      storyId: null,
      reason: "No new facts.",
      decidedBy: actor,
      decidedAt: "authoritative-time",
    } as const;
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, triageDecision }), { status: 200 }),
    );
    const result = await createSourceInboxClient(fetch).recordTriageDecision(
      source.id,
      "skip",
      null,
      "No new facts.",
    );
    expect(fetch).toHaveBeenCalledWith("/api/sources/source%2Fa%20b/triage", {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "skip", storyId: null, reason: "No new facts." }),
    });
    expect(result).toEqual({ kind: "completed", value: triageDecision });
  });

  it("fails safely on malformed evidence and does not retry", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            sources: [{ source, extractions: [{ ...extraction, extra: true }] }],
          }),
          { status: 200 },
        ),
    );
    await expect(createSourceInboxClient(fetch).listPendingSources()).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
