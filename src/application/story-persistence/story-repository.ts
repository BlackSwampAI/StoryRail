import type { OperatorActor, Story, StoryId, StoryPurpose } from "@/domain/editorial";

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
  findById(storyId: StoryId): Promise<Story | null>;
  updatePurpose(command: {
    readonly storyId: StoryId;
    readonly purpose: StoryPurpose;
    readonly updatedBy: OperatorActor;
    readonly updatedAt: string;
  }): Promise<UpdateStoryPurposeResult>;
}

export type UpdateStoryPurposeResult =
  | { readonly ok: true; readonly story: Story }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "STORY_NOT_FOUND" | "STORY_PURPOSE_LOCKED" | "STORY_AGENT_RUN_ACTIVE";
        readonly message: string;
      };
    };
