import {
  createStory,
  type Story,
  type StoryId,
  type StoryTitleRequiredError,
} from "@/domain/editorial";

import type { StoryIdConflictError, StoryRepository } from "../story-persistence/story-repository";

export interface CreateStoryWorkflowCommand {
  readonly title: string;
  readonly purpose?: import("@/domain/editorial").StoryPurpose;
}

export interface CreateStoryWorkflowDependencies {
  readonly storyRepository: StoryRepository;
  readonly createStoryId: () => StoryId;
  readonly now: () => string;
}

export type CreateStoryWorkflowResult =
  | {
      readonly ok: true;
      readonly story: Story;
    }
  | {
      readonly ok: false;
      readonly error:
        | StoryTitleRequiredError
        | StoryIdConflictError
        | { readonly code: "STORY_PURPOSE_INVALID"; readonly message: string };
    };

export type CreateStoryWorkflow = (
  command: CreateStoryWorkflowCommand,
) => Promise<CreateStoryWorkflowResult>;

export function createCreateStory(
  dependencies: CreateStoryWorkflowDependencies,
): CreateStoryWorkflow {
  return async (command) => {
    const storyId = dependencies.createStoryId();
    const createdAt = dependencies.now();
    const creationResult = createStory({
      storyId,
      title: command.title,
      ...(command.purpose ? { purpose: command.purpose } : {}),
      createdAt,
    });

    if (!creationResult.ok) {
      return creationResult;
    }

    return dependencies.storyRepository.persist({ story: creationResult.story });
  };
}
