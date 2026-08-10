import type { EditorialActor, SourceId, StoryId } from "./types";

export interface StorySourceAttachment {
  readonly storyId: StoryId;
  readonly sourceId: SourceId;
  readonly relevance: string;
  readonly attachedBy: EditorialActor;
  readonly attachedAt: string;
}

export interface AttachSourceToStoryCommand {
  readonly storyId: StoryId;
  readonly sourceId: SourceId;
  readonly relevance: string;
  readonly attachedBy: EditorialActor;
  readonly attachedAt: string;
}

export interface StorySourceRelevanceRequiredError {
  readonly code: "STORY_SOURCE_RELEVANCE_REQUIRED";
  readonly message: "A non-empty relevance is required to attach a Source to a Story.";
}

export type AttachSourceToStoryResult =
  | {
      readonly ok: true;
      readonly attachment: StorySourceAttachment;
    }
  | {
      readonly ok: false;
      readonly error: StorySourceRelevanceRequiredError;
    };
