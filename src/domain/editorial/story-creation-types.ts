import type { Story, StoryId } from "./types";

export interface CreateStoryCommand {
  readonly storyId: StoryId;
  readonly title: string;
  readonly createdAt: string;
}

export interface StoryTitleRequiredError {
  readonly code: "STORY_TITLE_REQUIRED";
  readonly message: string;
}

export type CreateStoryResult =
  | {
      readonly ok: true;
      readonly story: Story;
    }
  | {
      readonly ok: false;
      readonly error: StoryTitleRequiredError;
    };
