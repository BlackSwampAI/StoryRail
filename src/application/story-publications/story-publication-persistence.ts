import type { Story, StoryId, StoryTransitionReceipt } from "@/domain/editorial";

export interface PersistStoryPublicationCommand {
  readonly expectedStory: Story;
  readonly story: Story;
  readonly transitionReceipt: StoryTransitionReceipt;
}

export type PersistStoryPublicationResult =
  | {
      readonly ok: true;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "STORY_PUBLICATION_CONFLICT";
        readonly message: string;
        readonly storyId: StoryId;
      };
    };

export interface StoryPublicationPersistence {
  persist(command: PersistStoryPublicationCommand): Promise<PersistStoryPublicationResult>;
}
