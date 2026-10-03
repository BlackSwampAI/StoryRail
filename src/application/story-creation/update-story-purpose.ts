import type { OperatorActor, StoryId, StoryPurpose } from "@/domain/editorial";
import type { StoryRepository, UpdateStoryPurposeResult } from "@/application/story-persistence";
import { validateStoryPurpose } from "@/domain/editorial/story-creation-types";

export function createUpdateStoryPurpose(dependencies: {
  readonly repository: StoryRepository;
  readonly now: () => string;
}) {
  return async (command: {
    readonly storyId: StoryId;
    readonly purpose: StoryPurpose;
    readonly updatedBy: OperatorActor;
  }): Promise<
    | UpdateStoryPurposeResult
    | {
        readonly ok: false;
        readonly error: { readonly code: "STORY_PURPOSE_INVALID"; readonly message: string };
      }
  > => {
    const purpose = validateStoryPurpose(command.purpose);
    if (!purpose.ok) return purpose;
    return dependencies.repository.updatePurpose({
      storyId: command.storyId,
      purpose: purpose.purpose,
      updatedBy: command.updatedBy,
      updatedAt: dependencies.now(),
    });
  };
}
