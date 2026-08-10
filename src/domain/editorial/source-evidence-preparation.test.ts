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
});
