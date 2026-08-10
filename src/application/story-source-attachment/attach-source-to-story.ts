import {
  attachSourceToStory,
  type EditorialActor,
  type SourceId,
  type StoryId,
  type StorySourceRelevanceRequiredError,
} from "@/domain/editorial";

import type {
  AttachStorySourceResult,
  StorySourceAttachmentRepository,
} from "../story-source-persistence";

export interface AttachSourceToStoryWorkflowCommand {
  readonly storyId: StoryId;
  readonly sourceId: SourceId;
  readonly relevance: string;
  readonly attachedBy: EditorialActor;
}

export interface AttachSourceToStoryWorkflowDependencies {
  readonly attachmentRepository: StorySourceAttachmentRepository;
  readonly now: () => string;
}

export type AttachSourceToStoryWorkflowResult =
  | AttachStorySourceResult
  | {
      readonly ok: false;
      readonly error: StorySourceRelevanceRequiredError;
    };

export type AttachSourceToStoryWorkflow = (
  command: AttachSourceToStoryWorkflowCommand,
) => Promise<AttachSourceToStoryWorkflowResult>;

export function createAttachSourceToStory(
  dependencies: AttachSourceToStoryWorkflowDependencies,
): AttachSourceToStoryWorkflow {
  return async (command) => {
    const attachedAt = dependencies.now();
    const attachmentResult = attachSourceToStory({
      storyId: command.storyId,
      sourceId: command.sourceId,
      relevance: command.relevance,
      attachedBy: command.attachedBy,
      attachedAt,
    });

    if (!attachmentResult.ok) {
      return attachmentResult;
    }

    return dependencies.attachmentRepository.attach({
      attachment: attachmentResult.attachment,
    });
  };
}
