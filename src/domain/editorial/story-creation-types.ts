import type { Story, StoryId } from "./types";

export interface StoryPurpose {
  readonly readerValue: string;
  /** Empty is permitted when the operator has not yet narrowed the focus. */
  readonly focus: string;
}

export const MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS = 2_000;

export function validateStoryPurpose(value: unknown):
  | { readonly ok: true; readonly purpose: StoryPurpose }
  | {
      readonly ok: false;
      readonly error: { readonly code: "STORY_PURPOSE_INVALID"; readonly message: string };
    } {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {
      ok: false,
      error: {
        code: "STORY_PURPOSE_INVALID",
        message: "Story purpose needs a reader benefit and focus.",
      },
    };
  const candidate = value as Record<string, unknown>;
  if (
    Object.keys(candidate).sort().join(",") !== "focus,readerValue" ||
    typeof candidate.readerValue !== "string" ||
    typeof candidate.focus !== "string"
  )
    return {
      ok: false,
      error: {
        code: "STORY_PURPOSE_INVALID",
        message: "Story purpose needs a reader benefit and focus.",
      },
    };
  const readerValue = candidate.readerValue.trim();
  const focus = candidate.focus.trim();
  if (
    !readerValue ||
    readerValue.length > MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS ||
    focus.length > MAXIMUM_STORY_PURPOSE_FIELD_CHARACTERS
  )
    return {
      ok: false,
      error: {
        code: "STORY_PURPOSE_INVALID",
        message: "Story purpose needs a reader benefit and fields within 2,000 characters.",
      },
    };
  return { ok: true, purpose: { readerValue, focus } };
}

export interface CreateStoryCommand {
  readonly storyId: StoryId;
  readonly title: string;
  readonly createdAt: string;
  readonly purpose?: StoryPurpose;
}

export interface StoryTitleRequiredError {
  readonly code: "STORY_TITLE_REQUIRED";
  readonly message: string;
}

export type CreateStoryResult =
  | {
      readonly ok: false;
      readonly error: { readonly code: "STORY_PURPOSE_INVALID"; readonly message: string };
    }
  | {
      readonly ok: true;
      readonly story: Story;
    }
  | {
      readonly ok: false;
      readonly error: StoryTitleRequiredError;
    };
