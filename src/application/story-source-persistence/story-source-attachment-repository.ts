import type { SourceId, StoryId, StorySourceAttachment } from "@/domain/editorial";

export interface AttachStorySourceCommand {
  readonly attachment: StorySourceAttachment;
}

export interface StorySourceConflictError {
  readonly code: "STORY_SOURCE_CONFLICT";
  readonly message: "A different Story-Source attachment for the same Story and Source already exists.";
  readonly storyId: StoryId;
  readonly sourceId: SourceId;
}

export interface AttachmentStoryNotFoundError {
  readonly code: "STORY_NOT_FOUND";
  readonly message: "The Story referenced by the attachment does not exist.";
  readonly storyId: StoryId;
}

export interface AttachmentSourceNotFoundError {
  readonly code: "SOURCE_NOT_FOUND";
  readonly message: "The Source referenced by the attachment does not exist.";
  readonly sourceId: SourceId;
}

export type AttachStorySourceResult =
  | {
      readonly ok: true;
      readonly attachment: StorySourceAttachment;
    }
  | {
      readonly ok: false;
      readonly error:
        StorySourceConflictError | AttachmentStoryNotFoundError | AttachmentSourceNotFoundError;
    };

export interface StorySourceAttachmentRepository {
  attach(command: AttachStorySourceCommand): Promise<AttachStorySourceResult>;
}
