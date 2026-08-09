import { describe, expect, expectTypeOf, it } from "vitest";

import { storyId, type Story, type StoryId } from "./types";
import type { CreateStoryCommand, CreateStoryResult } from "./story-creation-types";
import { createStory } from "./story-creation";

const ID = storyId("opaque-story-creation-id");
const OPAQUE_TIMESTAMP = "not parsed: 2026/08/09 25:61:99 +99";

describe("createStory", () => {
  it("constructs the exact initial Story from the supplied identity, title, and time", () => {
    const result = createStory({
      storyId: ID,
      title: "A durable editorial Story",
      createdAt: OPAQUE_TIMESTAMP,
    });

    expect(result).toEqual({
      ok: true,
      story: {
        id: ID,
        title: "A durable editorial Story",
        state: "intake",
        revisionCycle: 0,
        createdAt: OPAQUE_TIMESTAMP,
        updatedAt: OPAQUE_TIMESTAMP,
      },
    });
  });

  it.each(["", " ", "\t\n  \r"])("rejects the empty trimmed title %j", (title) => {
    expect(createStory({ storyId: ID, title, createdAt: OPAQUE_TIMESTAMP })).toEqual({
      ok: false,
      error: {
        code: "STORY_TITLE_REQUIRED",
        message: "A non-empty Story title is required.",
      },
    });
  });

  it("trims surrounding spaces, tabs, and newlines while preserving interior content exactly", () => {
    const title = "First  line\twith spacing\n\nSecond line";
    const result = createStory({
      storyId: ID,
      title: ` \t\n${title}\r\n  `,
      createdAt: OPAQUE_TIMESTAMP,
    });

    expect(result.ok && result.story.title).toBe(title);
  });

  it("does not impose an arbitrary maximum title length", () => {
    const title = "Story ".repeat(20_000);
    const result = createStory({ storyId: ID, title, createdAt: OPAQUE_TIMESTAMP });

    expect(result.ok && result.story.title).toBe(title.trim());
  });

  it("preserves the exact branded identity and opaque timestamp without parsing or normalization", () => {
    const result = createStory({ storyId: ID, title: "Opaque facts", createdAt: OPAQUE_TIMESTAMP });

    if (!result.ok) {
      throw new Error("The valid Story creation fixture must succeed.");
    }

    expect(result.story.id).toBe(ID);
    expect(result.story.createdAt).toBe(OPAQUE_TIMESTAMP);
    expect(result.story.updatedAt).toBe(OPAQUE_TIMESTAMP);
  });

  it("does not mutate the creation command", () => {
    const command: CreateStoryCommand = {
      storyId: ID,
      title: "  Preserve the command  ",
      createdAt: OPAQUE_TIMESTAMP,
    };
    const before = structuredClone(command);

    createStory(command);

    expect(command).toEqual(before);
  });

  it("exposes readonly branded public types", () => {
    expectTypeOf<CreateStoryCommand["storyId"]>().toEqualTypeOf<StoryId>();
    expectTypeOf<CreateStoryResult>().toMatchTypeOf<
      { readonly ok: true; readonly story: Story } | { readonly ok: false }
    >();

    const command: CreateStoryCommand = {
      storyId: ID,
      title: "Readonly command",
      createdAt: OPAQUE_TIMESTAMP,
    };
    expect(createStory(command).ok).toBe(true);
  });
});

function assertReadonlyStoryCreation(command: CreateStoryCommand, result: CreateStoryResult): void {
  // @ts-expect-error Story creation commands are readonly.
  command.title = "changed";
  if (result.ok) {
    // @ts-expect-error Created Story values expose readonly fields.
    result.story.title = "changed";
  }
}

void assertReadonlyStoryCreation;
