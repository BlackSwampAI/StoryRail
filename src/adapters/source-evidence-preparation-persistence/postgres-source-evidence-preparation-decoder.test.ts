import { describe, expect, it } from "vitest";

import { decodePostgresSourceEvidencePreparation } from "./postgres-source-evidence-preparation-decoder";

const payload = {
  id: "preparation-25",
  sourceId: "source-25",
  extractionId: "extraction-25",
  model: { provider: "openrouter", model: "operator/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-25" },
  startedAt: "opaque-started",
  completedAt: "opaque-completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "  # Prepared evidence  ",
    title: null,
    byline: null,
    publishedAt: "opaque-published",
    language: null,
  },
} as const;

const invariantError = () => new Error("safe invariant");

describe("PostgreSQL Source evidence preparation decoder", () => {
  it("strictly decodes and clones exact successful and failed records", () => {
    const decoded = decodePostgresSourceEvidencePreparation(payload, invariantError);
    expect(decoded).toEqual(payload);
    expect(decoded).not.toBe(payload);

    const { document: _discarded, ...common } = payload;
    void _discarded;
    const failed = {
      ...common,
      requestedBy: { type: "agent", role: "writer", runId: "run-25" },
      outcome: "failed",
      failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
    };
    expect(decodePostgresSourceEvidencePreparation(failed, invariantError)).toEqual(failed);
  });

  it.each([
    { ...payload, extra: true },
    { ...payload, document: { ...payload.document, content: " \n " } },
    { ...payload, model: { ...payload.model, provider: " openrouter " } },
    { ...payload, requestedBy: { type: "operator", operatorId: "operator", extra: true } },
  ])("rejects malformed persisted payload %# with one safe invariant", (malformed) => {
    expect(() => decodePostgresSourceEvidencePreparation(malformed, invariantError)).toThrow(
      "safe invariant",
    );
  });
});
