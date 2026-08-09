import type { CreateStoryCommand, CreateStoryResult } from "./story-creation-types";

export function createStory(command: CreateStoryCommand): CreateStoryResult {
  const title = command.title.trim();

  if (title.length === 0) {
    return {
      ok: false,
      error: {
        code: "STORY_TITLE_REQUIRED",
        message: "A non-empty Story title is required.",
      },
    };
  }

  return {
    ok: true,
    story: {
      id: command.storyId,
      title,
      state: "intake",
      revisionCycle: 0,
      createdAt: command.createdAt,
      updatedAt: command.createdAt,
    },
  };
}
