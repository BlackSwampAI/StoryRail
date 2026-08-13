import { describe, expect, it } from "vitest";
import {
  agentRunId,
  articleId,
  articleRevisionId,
  operatorId,
  reviewDecisionId,
  storyId,
} from "./types";
import { createReviewDecision } from "./review-decision";

const decision = {
  id: reviewDecisionId("decision-38"),
  storyId: storyId("story-38"),
  articleId: articleId("article-38"),
  revisionId: articleRevisionId("revision-38"),
  directorRunId: agentRunId("director-run-38"),
  decision: "approve" as const,
  reason: "Operator verified the recommendation.",
  decidedBy: { type: "operator" as const, operatorId: operatorId("operator-38") },
  decidedAt: "decided",
};

describe("ReviewDecision", () => {
  it("records a trimmed operator-owned decision", () => {
    expect(
      createReviewDecision({ ...decision, reason: "  Operator verified the recommendation.  " }),
    ).toEqual({ ok: true, decision });
  });

  it("rejects blank reasons and agent ownership", () => {
    expect(createReviewDecision({ ...decision, reason: " " })).toMatchObject({
      ok: false,
      error: { code: "REVIEW_DECISION_REASON_REQUIRED" },
    });
    expect(
      createReviewDecision({
        ...decision,
        decidedBy: { type: "agent", role: "editor_in_chief", runId: agentRunId("director-run-38") },
      } as never),
    ).toMatchObject({ ok: false, error: { code: "REVIEW_DECISION_OPERATOR_REQUIRED" } });
  });
});
