import type {
  AgentRunId,
  ArticleId,
  ArticleRevisionId,
  OperatorActor,
  ReviewDecisionId,
  StoryId,
} from "./types";

export const REVIEW_DECISIONS = ["approve", "request_changes"] as const;
export type ReviewDecisionValue = (typeof REVIEW_DECISIONS)[number];

export interface ReviewDecision {
  readonly id: ReviewDecisionId;
  readonly storyId: StoryId;
  readonly articleId: ArticleId;
  readonly revisionId: ArticleRevisionId;
  readonly directorRunId: AgentRunId;
  readonly decision: ReviewDecisionValue;
  readonly reason: string;
  readonly decidedBy: OperatorActor;
  readonly decidedAt: string;
}

export type CreateReviewDecisionResult =
  | { readonly ok: true; readonly decision: ReviewDecision }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "REVIEW_DECISION_IDENTITY_INVALID"
          | "REVIEW_DECISION_VALUE_INVALID"
          | "REVIEW_DECISION_REASON_REQUIRED"
          | "REVIEW_DECISION_OPERATOR_REQUIRED";
        readonly message: string;
      };
    };
