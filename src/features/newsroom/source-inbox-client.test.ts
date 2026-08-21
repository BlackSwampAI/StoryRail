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
const preparation = {
  id: "preparation-25",
  sourceId: source.id,
  extractionId: extraction.id,
  model: { provider: "openrouter", model: "operator/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  input: { rawCharacters: 512, submittedCharacters: 512 },
  requestedBy: actor,
  startedAt: "opaque-preparation-start",
  completedAt: "opaque-preparation-complete",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Prepared",
    title: null,
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
          JSON.stringify({
            ok: true,
            sources: [{ source, extractions: [extraction], preparations: [] }],
          }),
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
    expect(result).toEqual({
      kind: "completed",
      value: [{ source, extractions: [extraction], preparations: [] }],
    });
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

  it("performs the exact preparation POST and strictly restores the durable attempt", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ ok: true, preparation }), { status: 201 }),
    );
    const result = await createSourceInboxClient(fetch).prepareEvidence(source.id, extraction.id);
    expect(fetch).toHaveBeenCalledWith("/api/sources/source%2Fa%20b/preparations", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ extractionId: extraction.id }),
    });
    expect(result).toEqual({ kind: "completed", value: preparation });
    expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toMatch(/model|provider|prompt|actor/i);
  });

  it("fails closed for malformed preparation output without retry", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, preparation: { ...preparation, providerBody: "unsafe" } }),
          { status: 201 },
        ),
    );
    await expect(
      createSourceInboxClient(fetch).prepareEvidence(source.id, extraction.id),
    ).resolves.toMatchObject({ kind: "unavailable" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("posts an empty body to the Source extractions endpoint and restores the attempt", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, extraction }), { status: 201 }),
    );
    await expect(createSourceInboxClient(fetch).retryExtraction(source.id)).resolves.toEqual({
      kind: "completed",
      value: extraction,
    });
    expect(fetch).toHaveBeenCalledWith("/api/sources/source%2Fa%20b/extractions", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("treats a recorded extraction failure as a completed attempt", async () => {
    const failed = {
      id: "extraction-24-failed",
      sourceId: source.id,
      extractor: { key: "provider", version: "1" },
      requestedBy: actor,
      startedAt: "opaque-start",
      completedAt: "opaque-complete",
      outcome: "failed",
      failure: { code: "RESPONSE_REJECTED", retryable: false },
    } as const;
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, extraction: failed }), { status: 201 }),
    );
    await expect(createSourceInboxClient(fetch).retryExtraction(source.id)).resolves.toEqual({
      kind: "completed",
      value: failed,
    });
  });

  it("surfaces a known extraction application failure", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: "missing" } }),
          { status: 404 },
        ),
    );
    await expect(createSourceInboxClient(fetch).retryExtraction(source.id)).resolves.toEqual({
      kind: "application-failure",
      error: { code: "SOURCE_NOT_FOUND", message: "missing" },
    });
  });

  it("rejects a retried extraction belonging to another Source", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ ok: true, extraction: { ...extraction, sourceId: "other-source" } }),
          { status: 201 },
        ),
    );
    await expect(createSourceInboxClient(fetch).retryExtraction(source.id)).resolves.toMatchObject({
      kind: "unavailable",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("fails safely on malformed evidence and does not retry", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            sources: [{ source, extractions: [{ ...extraction, extra: true }], preparations: [] }],
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
