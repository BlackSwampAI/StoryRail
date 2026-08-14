import type { Story, StoryId, StoryTransitionReceipt } from "@/domain/editorial";

export interface PersistStoryRejectionCommand {
  readonly expectedStory: Story;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistStoryRejectionResult =
  | {
      readonly ok: true;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "STORY_REJECTION_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
      };
    };

export interface StoryRejectionPersistence {
  persist(command: PersistStoryRejectionCommand): Promise<PersistStoryRejectionResult>;
}
