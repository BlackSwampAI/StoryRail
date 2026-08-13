import type { CreateReviewDecisionResult, ReviewDecision } from "./review-decision-types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function createReviewDecision(candidate: ReviewDecision): CreateReviewDecisionResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.articleId) ||
    !nonEmpty(candidate.revisionId) ||
    !nonEmpty(candidate.directorRunId) ||
    !nonEmpty(candidate.decidedAt)
  )
    return {
      ok: false,
      error: {
        code: "REVIEW_DECISION_IDENTITY_INVALID",
        message: "ReviewDecision identities and time are required.",
      },
    };
  if (candidate.decision !== "approve" && candidate.decision !== "request_changes")
    return {
      ok: false,
      error: {
        code: "REVIEW_DECISION_VALUE_INVALID",
        message: "The review decision is unsupported.",
      },
    };
  if (!nonEmpty(candidate.reason))
    return {
      ok: false,
      error: {
        code: "REVIEW_DECISION_REASON_REQUIRED",
        message: "A non-empty operator decision reason is required.",
      },
    };
  if (candidate.decidedBy.type !== "operator" || !nonEmpty(candidate.decidedBy.operatorId))
    return {
      ok: false,
      error: {
        code: "REVIEW_DECISION_OPERATOR_REQUIRED",
        message: "A ReviewDecision must be owned by an operator.",
      },
    };
  return {
    ok: true,
    decision: structuredClone({ ...candidate, reason: candidate.reason.trim() }),
  };
}
