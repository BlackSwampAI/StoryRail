import { isDeepStrictEqual } from "node:util";

import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  agentRunId,
  operatorId,
  sourceId,
  storyId,
  type OperatorId,
  type SourceId,
  type StoryId,
  type StorySourceAttachment,
} from "@/domain/editorial";

import type {
  AttachStorySourceCommand,
  AttachStorySourceResult,
  StorySourceAttachmentRepository,
} from "./story-source-attachment-repository";

export interface StorySourceAttachmentRepositoryContractHarness {
  readonly createRepository: () =>
    StorySourceAttachmentRepository | Promise<StorySourceAttachmentRepository>;
  readonly addStory: (id: StoryId) => void | Promise<void>;
  readonly addSource: (id: SourceId) => void | Promise<void>;
}

function makeAttachment(suffix: string): StorySourceAttachment {
  return {
    storyId: storyId(`story-attachment-contract-${suffix}`),
    sourceId: sourceId(`source-attachment-contract-${suffix}`),
    relevance: `Relationship relevance ${suffix}`,
    attachedBy: { type: "operator", operatorId: operatorId(`operator-${suffix}`) },
    attachedAt: `opaque-attached-at-${suffix}`,
  };
}

export function describeStorySourceAttachmentRepositoryContract(
  createHarness: () =>
    | StorySourceAttachmentRepositoryContractHarness
    | Promise<StorySourceAttachmentRepositoryContractHarness>,
): void {
  let repository: StorySourceAttachmentRepository;
  let addStory: StorySourceAttachmentRepositoryContractHarness["addStory"];
  let addSource: StorySourceAttachmentRepositoryContractHarness["addSource"];

  beforeEach(async () => {
    const harness = await createHarness();
    repository = await harness.createRepository();
    addStory = harness.addStory;
    addSource = harness.addSource;
  });

  async function addParents(attachment: StorySourceAttachment): Promise<void> {
    await addStory(attachment.storyId);
    await addSource(attachment.sourceId);
  }

  describe("StorySourceAttachmentRepository contract", () => {
    it("stores and returns a complete new attachment", async () => {
      const attachment = makeAttachment("new");
      await addParents(attachment);
      await expect(repository.attach({ attachment })).resolves.toEqual({ ok: true, attachment });
    });

    it("treats an exact replay as idempotent success", async () => {
      const attachment = makeAttachment("replay");
      await addParents(attachment);
      await repository.attach({ attachment });
      await expect(repository.attach({ attachment: structuredClone(attachment) })).resolves.toEqual(
        {
          ok: true,
          attachment,
        },
      );
    });

    it("conflicts on every differing relationship fact and never overwrites", async () => {
      const attachment = makeAttachment("conflicts");
      const variants: StorySourceAttachment[] = [
        { ...attachment, relevance: "Different relevance" },
        {
          ...attachment,
          attachedBy: {
            type: "agent",
            role: "writer",
            runId: agentRunId("conflict-run"),
          },
        },
        {
          ...attachment,
          attachedBy: { type: "operator", operatorId: operatorId("different-operator") },
        },
        { ...attachment, attachedAt: "different-attached-at" },
      ];
      await addParents(attachment);
      await repository.attach({ attachment });

      for (const variant of variants) {
        await expect(repository.attach({ attachment: variant })).resolves.toEqual({
          ok: false,
          error: {
            code: "STORY_SOURCE_CONFLICT",
            message:
              "A different Story-Source attachment for the same Story and Source already exists.",
            storyId: attachment.storyId,
            sourceId: attachment.sourceId,
          },
        });
      }

      await expect(repository.attach({ attachment })).resolves.toEqual({ ok: true, attachment });
    });

    it("conflicts independently on an agent role and run ID", async () => {
      const agent = {
        type: "agent" as const,
        role: "writer" as const,
        runId: agentRunId("original-agent-run"),
      };
      const attachment: StorySourceAttachment = {
        ...makeAttachment("agent-conflicts"),
        attachedBy: agent,
      };
      await addParents(attachment);
      await repository.attach({ attachment });

      for (const attachedBy of [
        { ...agent, role: "fact_checker" as const },
        { ...agent, runId: agentRunId("different-agent-run") },
      ]) {
        await expect(
          repository.attach({ attachment: { ...attachment, attachedBy } }),
        ).resolves.toMatchObject({
          ok: false,
          error: { code: "STORY_SOURCE_CONFLICT" },
        });
      }

      await expect(repository.attach({ attachment })).resolves.toEqual({ ok: true, attachment });
    });

    it("preserves operator and agent provenance", async () => {
      const operatorAttachment = makeAttachment("operator");
      const agentAttachment: StorySourceAttachment = {
        ...makeAttachment("agent"),
        attachedBy: {
          type: "agent",
          role: "editor_in_chief",
          runId: agentRunId("agent-provenance-run"),
        },
      };
      await addParents(operatorAttachment);
      await addParents(agentAttachment);
      await expect(repository.attach({ attachment: operatorAttachment })).resolves.toEqual({
        ok: true,
        attachment: operatorAttachment,
      });
      await expect(repository.attach({ attachment: agentAttachment })).resolves.toEqual({
        ok: true,
        attachment: agentAttachment,
      });
    });

    it("isolates caller input, stored state, results, and nested actors", async () => {
      const original = makeAttachment("isolation");
      const mutable = structuredClone(original) as {
        storyId: StoryId;
        sourceId: SourceId;
        relevance: string;
        attachedBy: { type: "operator"; operatorId: OperatorId };
        attachedAt: string;
      };
      await addParents(original);
      const first = await repository.attach({ attachment: mutable });
      mutable.relevance = "mutated caller relevance";
      (mutable.attachedBy as { operatorId: string }).operatorId = "mutated caller actor";

      if (!first.ok) {
        throw new Error("The isolation setup write must succeed.");
      }
      (first.attachment as { relevance: string }).relevance = "mutated result relevance";
      (first.attachment.attachedBy as { operatorId: string }).operatorId = "mutated result actor";

      const second = await repository.attach({ attachment: original });
      if (!second.ok) {
        throw new Error("The exact isolation replay must succeed.");
      }
      expect(second.attachment).toEqual(original);
      expect(second.attachment).not.toBe(original);
      expect(second.attachment.attachedBy).not.toBe(original.attachedBy);
    });

    it("returns a fresh attachment and nested actor for every success", async () => {
      const attachment = makeAttachment("fresh");
      await addParents(attachment);
      const first = await repository.attach({ attachment });
      const second = await repository.attach({ attachment });
      const third = await repository.attach({ attachment });
      if (!first.ok || !second.ok || !third.ok) {
        throw new Error("Exact replays must succeed.");
      }

      expect(first.attachment).not.toBe(attachment);
      expect(second.attachment).not.toBe(first.attachment);
      expect(third.attachment).not.toBe(second.attachment);
      expect(first.attachment.attachedBy).not.toBe(attachment.attachedBy);
      expect(second.attachment.attachedBy).not.toBe(first.attachment.attachedBy);
      expect([first.attachment, second.attachment, third.attachment]).toEqual([
        attachment,
        attachment,
        attachment,
      ]);
    });

    it("reports a missing Story before any missing Source", async () => {
      const attachment = makeAttachment("missing-story");
      await addSource(attachment.sourceId);
      await expect(repository.attach({ attachment })).resolves.toEqual({
        ok: false,
        error: {
          code: "STORY_NOT_FOUND",
          message: "The Story referenced by the attachment does not exist.",
          storyId: attachment.storyId,
        },
      });
    });

    it("reports a missing Source after observing the Story", async () => {
      const attachment = makeAttachment("missing-source");
      await addStory(attachment.storyId);
      await expect(repository.attach({ attachment })).resolves.toEqual({
        ok: false,
        error: {
          code: "SOURCE_NOT_FOUND",
          message: "The Source referenced by the attachment does not exist.",
          sourceId: attachment.sourceId,
        },
      });
    });

    it("gives STORY_NOT_FOUND precedence when both parents are absent", async () => {
      const attachment = makeAttachment("both-missing");
      await expect(repository.attach({ attachment })).resolves.toMatchObject({
        ok: false,
        error: { code: "STORY_NOT_FOUND", storyId: attachment.storyId },
      });
    });

    it("uses the branded Story-Source pair as the complete identity and exposes only attach", () => {
      expectTypeOf<AttachStorySourceCommand["attachment"]["storyId"]>().toEqualTypeOf<StoryId>();
      expectTypeOf<AttachStorySourceCommand["attachment"]["sourceId"]>().toEqualTypeOf<SourceId>();
      expectTypeOf<AttachStorySourceResult>().toMatchTypeOf<
        { readonly ok: true; readonly attachment: StorySourceAttachment } | { readonly ok: false }
      >();
      expect(Object.keys(repository)).toEqual(["attach"]);
    });
  });
}

function assertReadonlyRepository(command: AttachStorySourceCommand): void {
  // @ts-expect-error Repository commands are readonly.
  command.attachment = makeAttachment("changed");
}

void assertReadonlyRepository;

export function createReferenceStorySourceAttachmentRepositoryHarness(): StorySourceAttachmentRepositoryContractHarness {
  const stories = new Set<StoryId>();
  const sources = new Set<SourceId>();
  const attachments = new Map<string, StorySourceAttachment>();

  return {
    createRepository() {
      return {
        async attach({ attachment }): Promise<AttachStorySourceResult> {
          const key = JSON.stringify([attachment.storyId, attachment.sourceId]);
          const existing = attachments.get(key);

          if (existing) {
            if (isDeepStrictEqual(existing, attachment)) {
              return { ok: true, attachment: structuredClone(existing) };
            }
            return {
              ok: false,
              error: {
                code: "STORY_SOURCE_CONFLICT",
                message:
                  "A different Story-Source attachment for the same Story and Source already exists.",
                storyId: attachment.storyId,
                sourceId: attachment.sourceId,
              },
            };
          }

          if (!stories.has(attachment.storyId)) {
            return {
              ok: false,
              error: {
                code: "STORY_NOT_FOUND",
                message: "The Story referenced by the attachment does not exist.",
                storyId: attachment.storyId,
              },
            };
          }
          if (!sources.has(attachment.sourceId)) {
            return {
              ok: false,
              error: {
                code: "SOURCE_NOT_FOUND",
                message: "The Source referenced by the attachment does not exist.",
                sourceId: attachment.sourceId,
              },
            };
          }

          const stored = structuredClone(attachment);
          attachments.set(key, stored);
          return { ok: true, attachment: structuredClone(stored) };
        },
      };
    },
    addStory(id) {
      stories.add(id);
    },
    addSource(id) {
      sources.add(id);
    },
  };
}
