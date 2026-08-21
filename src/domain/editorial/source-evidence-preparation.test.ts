import { describe, expect, it } from "vitest";

import {
  agentRunId,
  operatorId,
  recordSourceEvidencePreparation,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
} from "./index";

const common = {
  preparationId: sourceEvidencePreparationId("preparation-25"),
  sourceId: sourceId("source-25"),
  extractionId: sourceExtractionId("extraction-25"),
  model: { provider: "openrouter", model: "operator/chosen-model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  input: { rawCharacters: 512, submittedCharacters: 512 },
  requestedBy: { type: "operator", operatorId: operatorId("operator-25") } as const,
  startedAt: "opaque started timestamp",
  completedAt: "opaque completed timestamp",
};

describe("recordSourceEvidencePreparation", () => {
  it("records exact successful prepared evidence with nullable metadata", () => {
    const result = recordSourceEvidencePreparation({
      ...common,
      outcome: "succeeded",
      document: {
        format: "markdown",
        content: "  # Preserved prepared evidence  ",
        title: null,
        byline: null,
        publishedAt: "not a parsed date",
        language: null,
      },
    });

    expect(result).toEqual({
      ok: true,
      preparation: {
        id: common.preparationId,
        sourceId: common.sourceId,
        extractionId: common.extractionId,
        model: common.model,
        preparer: common.preparer,
        requestedBy: common.requestedBy,
        input: common.input,
        startedAt: common.startedAt,
        completedAt: common.completedAt,
        outcome: "succeeded",
        document: {
          format: "markdown",
          content: "  # Preserved prepared evidence  ",
          title: null,
          byline: null,
          publishedAt: "not a parsed date",
          language: null,
        },
      },
    });
  });

  it("records safe failed attempts and agent provenance", () => {
    const requestedBy = {
      type: "agent",
      role: "fact_checker",
      runId: agentRunId("run-25"),
    } as const;
    expect(
      recordSourceEvidencePreparation({
        ...common,
        requestedBy,
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
      }),
    ).toMatchObject({
      ok: true,
      preparation: { outcome: "failed", requestedBy, failure: { retryable: true } },
    });
  });

  it("rejects blank prepared Markdown and blank descriptors", () => {
    expect(
      recordSourceEvidencePreparation({
        ...common,
        outcome: "succeeded",
        document: {
          format: "markdown",
          content: " \n ",
          title: null,
          byline: null,
          publishedAt: null,
          language: null,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "PREPARED_SOURCE_CONTENT_REQUIRED" } });
    expect(
      recordSourceEvidencePreparation({
        ...common,
        model: { ...common.model, provider: " " },
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
      }),
    ).toMatchObject({ ok: false, error: { code: "PREPARATION_PROVIDER_REQUIRED" } });
  });

  it.each([
    ["a fractional raw length", { rawCharacters: 10.5, submittedCharacters: 10 }],
    ["a fractional submitted length", { rawCharacters: 10, submittedCharacters: 4.5 }],
    ["a negative raw length", { rawCharacters: -1, submittedCharacters: 0 }],
    ["a negative submitted length", { rawCharacters: 10, submittedCharacters: -1 }],
    ["more submitted than raw", { rawCharacters: 10, submittedCharacters: 11 }],
  ])("rejects %s", (_case, input) => {
    expect(
      recordSourceEvidencePreparation({
        ...common,
        input,
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
      }),
    ).toEqual({
      ok: false,
      error: {
        code: "PREPARATION_INPUT_MEASUREMENT_INVALID",
        message:
          "Preparation input lengths must be non-negative integers, and the submitted length cannot exceed the raw length.",
      },
    });
  });

  it("accepts evidence that was truncated for the model", () => {
    const result = recordSourceEvidencePreparation({
      ...common,
      input: { rawCharacters: 500_000, submittedCharacters: 120_000 },
      outcome: "failed",
      failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
    });

    expect(result).toMatchObject({
      ok: true,
      preparation: { input: { rawCharacters: 500_000, submittedCharacters: 120_000 } },
    });
  });
});
