import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  transitionStory,
  type OperatorActor,
  type StoryId,
  type StoryTransitionError,
  type TransitionId,
} from "@/domain/editorial";
import type {
  PersistStoryRejectionResult,
  StoryRejectionPersistence,
} from "./story-rejection-persistence";

export type RejectStoryResult =
  | Extract<PersistStoryRejectionResult, { readonly ok: true }>
  | {
      readonly ok: false;
      readonly error:
        | StoryTransitionError
        | Extract<PersistStoryRejectionResult, { readonly ok: false }>["error"]
        | {
            readonly code: "STORY_NOT_FOUND";
            readonly message: string;
            readonly storyId: StoryId;
          };
    };

export type RejectStoryWorkflow = (command: {
  readonly storyId: StoryId;
  readonly reason: string;
  readonly rejectedBy: OperatorActor;
}) => Promise<RejectStoryResult>;

export function createRejectStory(dependencies: {
  readonly inspections: StoryInspectionRepository;
  readonly persistence: StoryRejectionPersistence;
  readonly createTransitionId: () => TransitionId;
  readonly now: () => string;
}): RejectStoryWorkflow {
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
      nextState: "rejected",
      actor: command.rejectedBy,
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
