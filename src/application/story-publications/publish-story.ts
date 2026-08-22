import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  transitionStory,
  type OperatorActor,
  type StoryId,
  type StoryTransitionError,
  type TransitionId,
} from "@/domain/editorial";

import type {
  PersistStoryPublicationResult,
  StoryPublicationPersistence,
} from "./story-publication-persistence";

export type PublishStoryResult =
  | Extract<PersistStoryPublicationResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly error:
        | StoryTransitionError
        | Extract<PersistStoryPublicationResult, { readonly ok: false }>["error"]
        | {
            readonly code: "STORY_NOT_FOUND";
            readonly message: string;
            readonly storyId: StoryId;
          };
    };

export type PublishStoryWorkflow = (command: {
  readonly storyId: StoryId;
  readonly reason: string;
  readonly publishedBy: OperatorActor;
}) => Promise<PublishStoryResult>;

/**
 * Publication is the operator's decision to release an approved Story, recorded as the same kind
 * of durable transition as every other editorial move. It does not deliver the Article anywhere:
 * where a published Story goes is a separate concern from declaring that it is ready to go.
 */
export function createPublishStory(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly persistence: StoryPublicationPersistence;
  readonly createTransitionId: () => TransitionId;
  readonly now: () => string;
}): PublishStoryWorkflow {
  return async (command) => {
    const inspected = await dependencies.inspections.inspect(command.storyId);
    if (!inspected.ok)
      return {
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story does not exist.",
          storyId: command.storyId,
        },
      };

    const transition = transitionStory({
      story: inspected.inspection.story,
      nextState: "published",
      actor: command.publishedBy,
      reason: command.reason,
      transitionId: dependencies.createTransitionId(),
      occurredAt: dependencies.now(),
    });
    if (!transition.ok) return transition;

    return dependencies.persistence.persist({
      expectedStory: inspected.inspection.story,
      story: transition.story,
      transitionReceipt: transition.receipt,
    });
  };
}
