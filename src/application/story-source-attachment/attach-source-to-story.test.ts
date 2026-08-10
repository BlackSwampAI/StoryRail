import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  agentRunId,
  operatorId,
  sourceId,
  storyId,
  type EditorialActor,
  type StorySourceAttachment,
} from "@/domain/editorial";
import type {
  AttachStorySourceCommand,
  AttachStorySourceResult,
  StorySourceAttachmentRepository,
} from "@/application/story-source-persistence";

import {
  createAttachSourceToStory,
  type AttachSourceToStoryWorkflowCommand,
  type AttachSourceToStoryWorkflowDependencies,
} from "./attach-source-to-story";

const STORY_ID = storyId("workflow-story-id");
const SOURCE_ID = sourceId("workflow-source-id");
const NOW = "opaque attachment clock value";
const ACTOR = { type: "operator", operatorId: operatorId("workflow-operator") } as const;

function expectedAttachment(overrides: Partial<StorySourceAttachment> = {}): StorySourceAttachment {
  return {
    storyId: STORY_ID,
    sourceId: SOURCE_ID,
    relevance: "Primary workflow evidence",
    attachedBy: ACTOR,
    attachedAt: NOW,
    ...overrides,
  };
}

function createDependencies(result?: AttachStorySourceResult) {
  const attach = vi.fn(
    async (command: AttachStorySourceCommand): Promise<AttachStorySourceResult> =>
      result ?? { ok: true, attachment: structuredClone(command.attachment) },
  );
  const dependencies: AttachSourceToStoryWorkflowDependencies = {
    attachmentRepository: { attach },
    now: vi.fn(() => NOW),
  };
  return { dependencies, attach };
}

describe("createAttachSourceToStory", () => {
  it("exposes the exact public command and dependency surfaces", () => {
    expectTypeOf<AttachSourceToStoryWorkflowCommand>().toEqualTypeOf<{
      readonly storyId: typeof STORY_ID;
      readonly sourceId: typeof SOURCE_ID;
      readonly relevance: string;
      readonly attachedBy: EditorialActor;
    }>();
    expectTypeOf<AttachSourceToStoryWorkflowDependencies>().toEqualTypeOf<{
      readonly attachmentRepository: StorySourceAttachmentRepository;
      readonly now: () => string;
    }>();
  });

  it("calls the clock once before construction and persists the complete valid attachment once", async () => {
    const events: string[] = [];
    const { dependencies, attach } = createDependencies();
    vi.mocked(dependencies.now).mockImplementation(() => {
      events.push("clock");
      return NOW;
    });
    attach.mockImplementation(async (command) => {
      events.push("attach");
      return { ok: true, attachment: structuredClone(command.attachment) };
    });

    await expect(
      createAttachSourceToStory(dependencies)({
        storyId: STORY_ID,
        sourceId: SOURCE_ID,
        relevance: " \tPrimary workflow evidence\n ",
        attachedBy: ACTOR,
      }),
    ).resolves.toEqual({ ok: true, attachment: expectedAttachment() });
    expect(events).toEqual(["clock", "attach"]);
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach).toHaveBeenCalledWith({ attachment: expectedAttachment() });
  });

  it("returns validation failure unchanged and skips persistence after consuming one clock call", async () => {
    const { dependencies, attach } = createDependencies();
    const result = await createAttachSourceToStory(dependencies)({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: " \t\n ",
      attachedBy: ACTOR,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "STORY_SOURCE_RELEVANCE_REQUIRED",
        message: "A non-empty relevance is required to attach a Source to a Story.",
      },
    });
    expect(dependencies.now).toHaveBeenCalledTimes(1);
    expect(attach).not.toHaveBeenCalled();
  });

  it.each([
    [
      "success",
      {
        ok: true as const,
        attachment: expectedAttachment({ relevance: "Repository result" }),
      },
    ],
    [
      "conflict",
      {
        ok: false as const,
        error: {
          code: "STORY_SOURCE_CONFLICT" as const,
          message:
            "A different Story-Source attachment for the same Story and Source already exists." as const,
          storyId: STORY_ID,
          sourceId: SOURCE_ID,
        },
      },
    ],
    [
      "missing Story",
      {
        ok: false as const,
        error: {
          code: "STORY_NOT_FOUND" as const,
          message: "The Story referenced by the attachment does not exist." as const,
          storyId: STORY_ID,
        },
      },
    ],
    [
      "missing Source",
      {
        ok: false as const,
        error: {
          code: "SOURCE_NOT_FOUND" as const,
          message: "The Source referenced by the attachment does not exist." as const,
          sourceId: SOURCE_ID,
        },
      },
    ],
  ] as const)("returns repository %s by exact reference", async (_, repositoryResult) => {
    const { dependencies, attach } = createDependencies(repositoryResult);
    const result = await createAttachSourceToStory(dependencies)({
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: "Primary workflow evidence",
      attachedBy: ACTOR,
    });

    expect(result).toBe(repositoryResult);
    expect(attach).toHaveBeenCalledTimes(1);
  });

  it.each(["clock", "repository"] as const)(
    "propagates the exact unexpected %s exception without retrying",
    async (boundary) => {
      const failure = new Error(`${boundary} failed`);
      const { dependencies, attach } = createDependencies();
      if (boundary === "clock") {
        vi.mocked(dependencies.now).mockImplementation(() => {
          throw failure;
        });
      } else {
        attach.mockRejectedValue(failure);
      }

      await expect(
        createAttachSourceToStory(dependencies)({
          storyId: STORY_ID,
          sourceId: SOURCE_ID,
          relevance: "Primary workflow evidence",
          attachedBy: ACTOR,
        }),
      ).rejects.toBe(failure);
      expect(dependencies.now).toHaveBeenCalledTimes(1);
      expect(attach).toHaveBeenCalledTimes(boundary === "repository" ? 1 : 0);
    },
  );

  it("does not mutate caller facts, nested actor, or dependencies and exposes no parent pre-read", async () => {
    const { dependencies } = createDependencies();
    const attachedBy = {
      type: "agent" as const,
      role: "assignment_editor" as const,
      runId: agentRunId("workflow-run"),
    };
    const command: AttachSourceToStoryWorkflowCommand = {
      storyId: STORY_ID,
      sourceId: SOURCE_ID,
      relevance: "  Primary workflow evidence  ",
      attachedBy,
    };
    const commandBefore = structuredClone(command);
    const dependencyMembers = {
      attachmentRepository: dependencies.attachmentRepository,
      now: dependencies.now,
    };

    await createAttachSourceToStory(dependencies)(command);

    expect(command).toEqual(commandBefore);
    expect(attachedBy).toEqual(commandBefore.attachedBy);
    expect(dependencies).toEqual(dependencyMembers);
    expect(Object.keys(dependencies.attachmentRepository)).toEqual(["attach"]);
  });
});
