// @vitest-environment node

import { siteId } from "@/domain/editorial";
import { describe, expect, it, vi } from "vitest";

import {
  createSourceEvidenceUrlClient,
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceUrlClientDependencies,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";

const SITE_ID = siteId("site-second");

const SUBMITTED_URL = "  https://Example.com/report?utm_source=desk  ";
const SOURCE = Object.freeze({
  id: "source-0016",
  type: "url",
  submittedUrl: SUBMITTED_URL,
  canonicalUrl: "https://example.com/report",
  submittedBy: Object.freeze({ type: "operator", operatorId: "operator-0016" }),
  receivedAt: "2026-08-09T19:00:00.000Z",
});
const SUCCESSFUL_EXTRACTION = Object.freeze({
  id: "extraction-0016",
  sourceId: "source-0016",
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: Object.freeze({ type: "operator", operatorId: "operator-0016" }),
  startedAt: "2026-08-09T19:00:01.000Z",
  completedAt: "2026-08-09T19:00:02.000Z",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Evidence\n\nComplete content.",
    title: "Evidence",
    byline: null,
    publishedAt: null,
    language: "en",
  }),
});
const FAILED_EXTRACTION = Object.freeze({
  id: "extraction-failed-0016",
  sourceId: "source-0016",
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: Object.freeze({ type: "operator", operatorId: "operator-0016" }),
  startedAt: "2026-08-09T19:00:01.000Z",
  completedAt: "2026-08-09T19:00:02.000Z",
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function controlledClient(response: Response) {
  const fetch = vi.fn<SourceEvidenceUrlClientDependencies["fetch"]>(async () => response);
  const dependencies: SourceEvidenceUrlClientDependencies = { siteId: SITE_ID, fetch };
  const request: RequestSourceEvidenceUrl = createSourceEvidenceUrlClient(dependencies);

  return { fetch, request };
}

describe("source-evidence-url-client", () => {
  it("exposes inert public dependency, request, result, and factory contracts", () => {
    const fetch = vi.fn<SourceEvidenceUrlClientDependencies["fetch"]>(async () =>
      jsonResponse(201, {}),
    );
    const dependencies: SourceEvidenceUrlClientDependencies = { siteId: SITE_ID, fetch };
    const request: RequestSourceEvidenceUrl = createSourceEvidenceUrlClient(dependencies);
    const result: SourceEvidenceUrlResult = {
      kind: "unavailable",
      message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
    };

    expect(createSourceEvidenceUrlClient).toBeTypeOf("function");
    expect(request).toBeTypeOf("function");
    expect(result.kind).toBe("unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([SUBMITTED_URL, "", "   "])(
    "sends one exact request with the unchanged submitted string %j",
    async (submittedUrl) => {
      const controlled = controlledClient(
        jsonResponse(201, { ok: true, source: SOURCE, extraction: SUCCESSFUL_EXTRACTION }),
      );

      await controlled.request(submittedUrl);

      expect(controlled.fetch).toHaveBeenCalledOnce();
      expect(controlled.fetch).toHaveBeenCalledWith("/api/sites/site-second/source-evidence/url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ submittedUrl }),
      });
      const init = controlled.fetch.mock.calls[0]![1];
      const parsed: unknown = JSON.parse(String(init?.body));
      expect(parsed).toEqual({ submittedUrl });
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Expected the request body to be a JSON object.");
      }
      const keys = Object.keys(parsed);
      expect(keys).toEqual(["submittedUrl"]);
      for (const forbiddenField of [
        "identity",
        "operatorId",
        "actor",
        "source",
        "sourceId",
        "extraction",
        "extractionId",
        "timestamp",
        "provider",
        "retry",
        "transaction",
        "configuration",
        "credential",
        "connectionString",
      ]) {
        expect(keys).not.toContain(forbiddenField);
      }
    },
  );

  it.each([
    ["successful extraction", SUCCESSFUL_EXTRACTION],
    ["durable provider failure", FAILED_EXTRACTION],
  ] as const)(
    "classifies completed %s as completed without mutating it",
    async (_label, extraction) => {
      const body = Object.freeze({ ok: true, source: SOURCE, extraction });
      const before = JSON.stringify(body);
      const controlled = controlledClient(jsonResponse(201, body));

      const result = await controlled.request(SUBMITTED_URL);

      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") throw new Error("Expected a completed result.");
      expect(result.source).toEqual(SOURCE);
      expect(result.extraction).toEqual(extraction);
      expect(JSON.stringify(body)).toBe(before);
      expect(controlled.fetch).toHaveBeenCalledOnce();
    },
  );

  it("reads back evidence a Researcher submitted and retrieved", async () => {
    const requestedBy = { type: "agent", role: "researcher", runId: "research-run-26" } as const;
    const source = { ...SOURCE, submittedBy: requestedBy };
    const extraction = { ...SUCCESSFUL_EXTRACTION, requestedBy };
    const controlled = controlledClient(jsonResponse(201, { ok: true, source, extraction }));

    const result = await controlled.request(SUBMITTED_URL);

    expect(result.kind).toBe("completed");
    if (result.kind !== "completed") throw new Error("Expected a completed result.");
    expect(result.source).toEqual(source);
    expect(result.extraction).toEqual(extraction);
  });

  it("classifies 422 URL validation and retains structured facts", async () => {
    const controlled = controlledClient(
      jsonResponse(422, {
        ok: false,
        stage: "preservation",
        error: { code: "SOURCE_URL_TOO_LONG", message: "Too long.", maximumLength: 2048 },
      }),
    );

    await expect(controlled.request("x")).resolves.toEqual({
      kind: "preservation-validation-failure",
      error: { code: "SOURCE_URL_TOO_LONG", message: "Too long.", maximumLength: 2048 },
    });
  });

  it.each([
    [
      "duplicate",
      {
        code: "DUPLICATE_SOURCE",
        message: "Already preserved.",
        existingSourceId: "source-existing",
        canonicalUrl: "https://example.com/report",
      },
    ],
    [
      "identity conflict",
      { code: "SOURCE_ID_CONFLICT", message: "Identity conflict.", sourceId: "source-0016" },
    ],
  ] as const)("classifies 409 %s", async (_label, error) => {
    const controlled = controlledClient(
      jsonResponse(409, { ok: false, stage: "preservation", error }),
    );

    const result = await controlled.request(SUBMITTED_URL);

    expect(result).toEqual({ kind: "preservation-conflict", error });
  });

  it("retains the preserved Source for extraction-stage 500", async () => {
    const error = {
      code: "SOURCE_EXTRACTION_ID_CONFLICT",
      message: "Extraction identity conflict.",
      extractionId: "extraction-conflict",
    };
    const controlled = controlledClient(
      jsonResponse(500, { ok: false, stage: "extraction", source: SOURCE, error }),
    );

    await expect(controlled.request(SUBMITTED_URL)).resolves.toEqual({
      kind: "partial-completion",
      stage: "extraction",
      source: SOURCE,
      error,
    });
  });

  it.each([
    [400, "INVALID_JSON"],
    [400, "INVALID_REQUEST"],
    [415, "UNSUPPORTED_MEDIA_TYPE"],
  ] as const)("classifies stable %i %s as an interface rejection", async (status, code) => {
    const error = { code, message: "Controlled interface rejection." };
    const controlled = controlledClient(jsonResponse(status, { ok: false, error }));

    await expect(controlled.request(SUBMITTED_URL)).resolves.toEqual({
      kind: "interface-rejection",
      error,
    });
  });

  it("keeps the generic internal 500 generic", async () => {
    const error = {
      code: "INTERNAL_SERVER_ERROR",
      message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
    };
    const controlled = controlledClient(jsonResponse(500, { ok: false, error }));

    await expect(controlled.request(SUBMITTED_URL)).resolves.toEqual({
      kind: "internal-failure",
      error,
    });
  });

  it.each([
    ["malformed JSON", () => new Response("{", { status: 201 })],
    ["structurally invalid JSON", () => jsonResponse(201, { ok: true, source: {} })],
    ["unexpected status", () => jsonResponse(202, { ok: true, source: SOURCE })],
    [
      "unrecognized body",
      () =>
        jsonResponse(500, {
          ok: false,
          error: { code: "INTERNAL_SERVER_ERROR", message: "raw-secret" },
        }),
    ],
  ] as const)("fails closed for %s", async (_label, makeResponse) => {
    const controlled = controlledClient(makeResponse());

    const result = await controlled.request(SUBMITTED_URL);

    expect(result).toEqual({
      kind: "unavailable",
      message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain("raw-secret");
    expect(controlled.fetch).toHaveBeenCalledOnce();
  });

  it("redacts fetch rejection details and never retries", async () => {
    const secret = "postgres://operator:secret@example.internal/storyrail";
    const fetch = vi.fn<SourceEvidenceUrlClientDependencies["fetch"]>(async () => {
      throw new Error(secret);
    });
    const request = createSourceEvidenceUrlClient({ siteId: SITE_ID, fetch });

    const result = await request(SUBMITTED_URL);

    expect(result).toEqual({
      kind: "unavailable",
      message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
    });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not export server, runtime, repository, Pool, credential, or connection details", async () => {
    const exports = await import("./source-evidence-url-client");

    expect(Object.keys(exports).sort()).toEqual([
      "SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE",
      "createSourceEvidenceUrlClient",
    ]);
    expect(exports).not.toHaveProperty("runtime");
    expect(exports).not.toHaveProperty("configuration");
    expect(exports).not.toHaveProperty("pool");
    expect(exports).not.toHaveProperty("repository");
    expect(exports).not.toHaveProperty("credentials");
    expect(exports).not.toHaveProperty("connectionString");
  });
});
