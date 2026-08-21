import { describe, expect, it, vi } from "vitest";

import { operatorId, sourceExtractionId, sourceId } from "@/domain/editorial";
import type { SourceEvidenceRuntime } from "@/runtime";

import { createExtractPersistedSourceHttpHandler } from "./extract-persisted-source-handler";

const common = {
  id: sourceExtractionId("extraction-http-45"),
  sourceId: sourceId("source-http-45"),
  extractor: { key: "firecrawl", version: "v2" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-http-45") },
  startedAt: "started",
  completedAt: "completed",
} as const;

const succeeded = {
  ...common,
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Extracted",
    title: null,
    byline: null,
    publishedAt: null,
    language: null,
  },
} as const;

const failed = {
  ...common,
  outcome: "failed",
  failure: { code: "RETRIEVAL_FAILED", retryable: true },
} as const;

function request(body: unknown = {}, contentType = "application/json") {
  return new Request("http://localhost/api/sources/source-http-45/extractions", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ sourceId: "source-http-45" }) };
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STORYRAIL_OPERATOR_ID: "operator-http-45",
};

function runtimeWith(
  extractPersistedSource: SourceEvidenceRuntime["extractPersistedSource"],
): SourceEvidenceRuntime {
  return {
    extractPersistedSource,
    preserveUrlSource: vi.fn(),
    preserveAndExtractUrlSource: vi.fn(),
    close: vi.fn(async () => {}),
  } as unknown as SourceEvidenceRuntime;
}

function handler(runtime: SourceEvidenceRuntime) {
  return createExtractPersistedSourceHttpHandler({ getRuntime: () => runtime, environment });
}

describe("extract persisted Source HTTP handler", () => {
  it("appends a retried extraction and derives operator provenance server-side", async () => {
    const extractPersistedSource = vi.fn(async () => ({
      ok: true as const,
      extraction: succeeded,
    }));
    const response = await handler(runtimeWith(extractPersistedSource))(request(), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, extraction: succeeded });
    expect(extractPersistedSource).toHaveBeenCalledWith({
      sourceId: "source-http-45",
      requestedBy: { type: "operator", operatorId: "operator-http-45" },
    });
  });

  it("reports a durably recorded extraction failure as a created attempt", async () => {
    const response = await handler(
      runtimeWith(vi.fn(async () => ({ ok: true as const, extraction: failed }))),
    )(request(), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, extraction: failed });
  });

  it("returns 404 when the Source does not exist", async () => {
    const response = await handler(
      runtimeWith(
        vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "SOURCE_NOT_FOUND" as const,
            message: "The Source referenced by the extraction does not exist.",
            sourceId: sourceId("source-http-45"),
          },
        })),
      ),
    )(request(), context);

    expect(response.status).toBe(404);
  });

  it("returns 409 when the extraction identity conflicts", async () => {
    const response = await handler(
      runtimeWith(
        vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "SOURCE_EXTRACTION_ID_CONFLICT" as const,
            message: "conflict",
            extractionId: sourceExtractionId("extraction-http-45"),
          },
        })),
      ),
    )(request(), context);

    expect(response.status).toBe(409);
  });

  it("returns 422 when the recorded extraction is invalid", async () => {
    const response = await handler(
      runtimeWith(
        vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "EXTRACTED_SOURCE_CONTENT_REQUIRED" as const,
            message: "Successful Source extraction requires non-empty Markdown content.",
          },
        })),
      ),
    )(request(), context);

    expect(response.status).toBe(422);
  });

  it("rejects a non-JSON media type", async () => {
    const extractPersistedSource = vi.fn();
    const response = await handler(runtimeWith(extractPersistedSource))(
      request({}, "text/plain"),
      context,
    );

    expect(response.status).toBe(415);
    expect(extractPersistedSource).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const extractPersistedSource = vi.fn();
    const response = await handler(runtimeWith(extractPersistedSource))(
      request("{not json"),
      context,
    );

    expect(response.status).toBe(400);
    expect(extractPersistedSource).not.toHaveBeenCalled();
  });

  it("rejects a body carrying any property", async () => {
    const extractPersistedSource = vi.fn();
    const response = await handler(runtimeWith(extractPersistedSource))(
      request({ sourceId: "source-http-45" }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "The request body must be an empty JSON object.",
      },
    });
    expect(extractPersistedSource).not.toHaveBeenCalled();
  });

  it("fails safely when the operator is not configured", async () => {
    const extractPersistedSource = vi.fn();
    const response = await createExtractPersistedSourceHttpHandler({
      getRuntime: () => runtimeWith(extractPersistedSource),
      environment: { NODE_ENV: "test" },
    })(request(), context);

    expect(response.status).toBe(500);
    expect(extractPersistedSource).not.toHaveBeenCalled();
  });

  it("fails safely when the runtime throws", async () => {
    const response = await handler(
      runtimeWith(
        vi.fn(async () => {
          throw new Error("unavailable");
        }),
      ),
    )(request(), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "The Source extraction request could not be completed.",
      },
    });
  });
});
