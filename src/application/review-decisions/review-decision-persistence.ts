import type {
  ReviewDecision,
  ReviewDecisionId,
  Story,
  StoryId,
  StoryTransitionReceipt,
} from "@/domain/editorial";

export interface PersistReviewDecisionCommand {
  readonly expectedStory: Story;
  readonly decision: ReviewDecision;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistReviewDecisionResult =
  | {
      readonly ok: true;
      readonly decision: ReviewDecision;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code:
          | "REVIEW_DECISION_ALREADY_EXISTS"
          | "REVIEW_DECISION_ID_CONFLICT"
          | "REVIEW_DECISION_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
        readonly decisionId?: ReviewDecisionId;
      };
    };

export interface ReviewDecisionPersistence {
  persist(command: PersistReviewDecisionCommand): Promise<PersistReviewDecisionResult>;
}
