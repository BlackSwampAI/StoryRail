import type { EditorialActor } from "./types";
import type {
  AttachSourceToStoryCommand,
  AttachSourceToStoryResult,
} from "./story-source-attachment-types";

function copyActor(actor: EditorialActor): EditorialActor {
  return actor.type === "operator"
    ? { type: "operator", operatorId: actor.operatorId }
    : { type: "agent", role: actor.role, runId: actor.runId };
}

export function attachSourceToStory(
  command: AttachSourceToStoryCommand,
): AttachSourceToStoryResult {
  const relevance = command.relevance.trim();

  if (relevance.length === 0) {
    return {
      ok: false,
      error: {
        code: "STORY_SOURCE_RELEVANCE_REQUIRED",
        message: "A non-empty relevance is required to attach a Source to a Story.",
      },
    };
  }

  return {
    ok: true,
    attachment: {
      storyId: command.storyId,
      sourceId: command.sourceId,
      relevance,
      attachedBy: copyActor(command.attachedBy),
      attachedAt: command.attachedAt,
    },
  };
}
