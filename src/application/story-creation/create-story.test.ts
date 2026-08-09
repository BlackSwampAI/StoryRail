import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { storyId, type Story } from "@/domain/editorial";
import type {
  PersistStoryCommand,
  PersistStoryResult,
  StoryRepository,
} from "@/application/story-persistence";

import {
  createCreateStory,
  type CreateStoryWorkflowCommand,
  type CreateStoryWorkflowDependencies,
} from "./create-story";

const ID = storyId("workflow-story-id");
const NOW = "opaque workflow clock value";

function expectedStory(title = "Workflow Story"): Story {
  return {
    id: ID,
    title,
    state: "intake",
    revisionCycle: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createDependencies(result?: PersistStoryResult) {
  const persist = vi.fn(
    async (command: PersistStoryCommand): Promise<PersistStoryResult> =>
      result ?? { ok: true, story: structuredClone(command.story) },
  );
  const dependencies: CreateStoryWorkflowDependencies = {
    storyRepository: { persist },
    createStoryId: vi.fn(() => ID),
    now: vi.fn(() => NOW),
  };
  return { dependencies, persist };
}

describe("createCreateStory", () => {
  it("exposes the exact public command and dependency types", () => {
    expectTypeOf<CreateStoryWorkflowCommand>().toEqualTypeOf<{ readonly title: string }>();
    expectTypeOf<CreateStoryWorkflowDependencies>().toEqualTypeOf<{
      readonly storyRepository: StoryRepository;
      readonly createStoryId: () => typeof ID;
      readonly now: () => string;
    }>();
  });

  it("calls identity and clock once, delegates the exact domain facts, and persists the complete Story", async () => {
    const { dependencies, persist } = createDependencies();
    const workflow = createCreateStory(dependencies);

    await expect(workflow({ title: " \tWorkflow Story\n " })).resolves.toEqual({
      ok: true,
      story: expectedStory(),
    });
    expect(dependencies.createStoryId).toHaveBeenCalledTimes(1);
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ story: expectedStory() });
  });

  it("returns the exact repository result object unchanged", async () => {
    const repositoryResult: PersistStoryResult = {
      ok: true,
      story: expectedStory("Repository-owned result"),
    };
    const { dependencies } = createDependencies(repositoryResult);

    const result = await createCreateStory(dependencies)({ title: "Workflow Story" });

    expect(result).toBe(repositoryResult);
  });

  it("returns title validation failure unchanged and skips persistence", async () => {
    const { dependencies, persist } = createDependencies();

    await expect(createCreateStory(dependencies)({ title: " \t\n " })).resolves.toEqual({
      ok: false,
      error: {
        code: "STORY_TITLE_REQUIRED",
        message: "A non-empty Story title is required.",
      },
    });
    expect(dependencies.createStoryId).toHaveBeenCalledTimes(1);
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(persist).not.toHaveBeenCalled();
  });

  it("returns a repository Story-ID conflict unchanged without retrying", async () => {
    const conflict: PersistStoryResult = {
      ok: false,
      error: {
        code: "STORY_ID_CONFLICT",
        message: "A different Story with the same Story ID already exists.",
        storyId: ID,
      },
    };
    const { dependencies, persist } = createDependencies(conflict);

    const result = await createCreateStory(dependencies)({ title: "Workflow Story" });

    expect(result).toBe(conflict);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it.each(["identity", "clock", "repository"] as const)(
    "propagates the exact unexpected %s exception",
    async (boundary) => {
      const failure = new Error(`${boundary} failed`);
      const { dependencies, persist } = createDependencies();

      if (boundary === "identity") {
        vi.mocked(dependencies.createStoryId).mockImplementation(() => {
          throw failure;
        });
      } else if (boundary === "clock") {
        vi.mocked(dependencies.now).mockImplementation(() => {
          throw failure;
        });
      } else {
        persist.mockRejectedValue(failure);
      }

      await expect(createCreateStory(dependencies)({ title: "Workflow Story" })).rejects.toBe(
        failure,
      );
      expect(persist).toHaveBeenCalledTimes(boundary === "repository" ? 1 : 0);
    },
  );

  it("does not mutate the command or dependency object and has no repository pre-read surface", async () => {
    const { dependencies } = createDependencies();
    const command: CreateStoryWorkflowCommand = { title: "  Workflow Story  " };
    const dependencyMembers = {
      storyRepository: dependencies.storyRepository,
      createStoryId: dependencies.createStoryId,
      now: dependencies.now,
    };

    await createCreateStory(dependencies)(command);

    expect(command).toEqual({ title: "  Workflow Story  " });
    expect(dependencies).toEqual(dependencyMembers);
    expect(Object.keys(dependencies.storyRepository)).toEqual(["persist"]);
  });
});
