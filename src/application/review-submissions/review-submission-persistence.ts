import type { Story, StoryId, StoryTransitionReceipt } from "@/domain/editorial";

export interface PersistReviewSubmissionCommand {
  readonly expectedStory: Story;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistReviewSubmissionResult =
  | {
      readonly ok: true;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "REVIEW_SUBMISSION_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
      };
    };

export interface ReviewSubmissionPersistence {
  persist(command: PersistReviewSubmissionCommand): Promise<PersistReviewSubmissionResult>;
}
