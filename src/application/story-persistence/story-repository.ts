import type { Story, StoryId } from "@/domain/editorial";

export interface PersistStoryCommand {
  readonly story: Story;
}

export interface StoryIdConflictError {
  readonly code: "STORY_ID_CONFLICT";
  readonly message: string;
  readonly storyId: StoryId;
}

export type PersistStoryResult =
  | {
      readonly ok: true;
      readonly story: Story;
    }
  | {
      readonly ok: false;
      readonly error: StoryIdConflictError;
    };

export interface StoryRepository {
  persist(command: PersistStoryCommand): Promise<PersistStoryResult>;
}
