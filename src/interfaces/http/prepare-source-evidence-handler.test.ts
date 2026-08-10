import { describe, expect, it, vi } from "vitest";

import {
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
} from "@/domain/editorial";
import type { EvidencePreparationRuntime } from "@/runtime";

import { createPrepareSourceEvidenceHttpHandler } from "./prepare-source-evidence-handler";

const preparation = {
  id: sourceEvidencePreparationId("preparation-http-25"),
  sourceId: sourceId("source-http-25"),
  extractionId: sourceExtractionId("extraction-http-25"),
  model: { provider: "openrouter", model: "operator/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-http-25") },
  startedAt: "started",
  completedAt: "completed",
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

function request(body: unknown, contentType = "application/json") {
  return new Request("http://localhost/api/sources/source-http-25/preparations", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ sourceId: "source-http-25" }) };
const environment: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STORYRAIL_OPERATOR_ID: "operator-http-25",
};

function runtimeWith(
  prepareSourceEvidence: EvidencePreparationRuntime["prepareSourceEvidence"],
): EvidencePreparationRuntime {
  return { prepareSourceEvidence, close: vi.fn(async () => {}) };
}

describe("prepare Source evidence HTTP handler", () => {
  it("accepts only extractionId and derives operator provenance server-side", async () => {
    const prepareSourceEvidence = vi.fn(async () => ({ ok: true as const, preparation }));
    const runtime = runtimeWith(prepareSourceEvidence);
    const response = await createPrepareSourceEvidenceHttpHandler({
      getRuntime: () => runtime,
      environment,
    })(request({ extractionId: "extraction-http-25" }), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, preparation });
    expect(prepareSourceEvidence).toHaveBeenCalledWith({
      sourceId: "source-http-25",
      extractionId: "extraction-http-25",
      requestedBy: { type: "operator", operatorId: "operator-http-25" },
    });
  });

  it.each([
    [{ extractionId: "extraction", model: "browser/model" }, 400, "INVALID_REQUEST"],
    ["{", 400, "INVALID_JSON"],
    [{ extractionId: "extraction" }, 415, "UNSUPPORTED_MEDIA_TYPE"],
  ] as const)("rejects invalid request %#", async (body, status, code) => {
    const getRuntime = vi.fn();
    const response = await createPrepareSourceEvidenceHttpHandler({ getRuntime })(
      request(body, status === 415 ? "text/plain" : "application/json"),
      context,
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code } });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("returns durable model failure as success and maps preconditions narrowly", async () => {
    const { document: _discardedDocument, ...preparationCommon } = preparation;
    void _discardedDocument;
    const failedPreparation = {
      ...preparationCommon,
      outcome: "failed" as const,
      failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
    };
    const prepareSourceEvidence = vi
      .fn<EvidencePreparationRuntime["prepareSourceEvidence"]>()
      .mockResolvedValueOnce({ ok: true, preparation: failedPreparation })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "SOURCE_EXTRACTION_NOT_PREPARABLE",
          message: "Not preparable.",
          extractionId: preparation.extractionId,
        },
      });
    const handler = createPrepareSourceEvidenceHttpHandler({
      getRuntime: () => runtimeWith(prepareSourceEvidence),
      environment,
    });
    expect(
      (await handler(request({ extractionId: preparation.extractionId }), context)).status,
    ).toBe(201);
    expect(
      (await handler(request({ extractionId: preparation.extractionId }), context)).status,
    ).toBe(422);
  });

  it("returns a safe 500 without leaking thrown details", async () => {
    const handler = createPrepareSourceEvidenceHttpHandler({
      getRuntime: () => {
        throw new Error("OPENROUTER_API_KEY=secret");
      },
      environment,
    });
    const response = await handler(request({ extractionId: preparation.extractionId }), context);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
