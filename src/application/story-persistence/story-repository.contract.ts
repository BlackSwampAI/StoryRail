import { isDeepStrictEqual } from "node:util";

import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import { storyId, type Story, type StoryId } from "@/domain/editorial";

import type { PersistStoryCommand, PersistStoryResult, StoryRepository } from "./story-repository";

export type CreateStoryRepositoryContractHarness = () => StoryRepository | Promise<StoryRepository>;

function makeStory(suffix: string): Story {
  return {
    id: storyId(`story-contract-${suffix}`),
    title: `Story contract ${suffix}`,
    state: "intake",
    revisionCycle: 0,
    createdAt: `opaque-created-${suffix}`,
    updatedAt: `opaque-updated-${suffix}`,
  };
}

export function describeStoryRepositoryContract(
  createRepository: CreateStoryRepositoryContractHarness,
): void {
  let repository: StoryRepository;

  beforeEach(async () => {
    repository = await createRepository();
  });

  describe("StoryRepository contract", () => {
    it("persists and returns the complete Story", async () => {
      const story = makeStory("first");

      await expect(repository.persist({ story })).resolves.toEqual({ ok: true, story });
    });

    it("treats a structurally exact replay as idempotent success", async () => {
      const story = makeStory("replay");

      await repository.persist({ story });
      await expect(repository.persist({ story: structuredClone(story) })).resolves.toEqual({
        ok: true,
        story,
      });
    });

    it("returns STORY_ID_CONFLICT for every differing Story fact and never overwrites", async () => {
      const story = makeStory("conflict");
      const variants: Story[] = [
        { ...story, title: "Different title" },
        { ...story, state: "assigned" },
        { ...story, revisionCycle: 1 },
        { ...story, createdAt: "different-created" },
        { ...story, updatedAt: "different-updated" },
      ];
      await repository.persist({ story });

      for (const variant of variants) {
        await expect(repository.persist({ story: variant })).resolves.toEqual({
          ok: false,
          error: {
            code: "STORY_ID_CONFLICT",
            message: "A different Story with the same Story ID already exists.",
            storyId: story.id,
          },
        });
      }

      await expect(repository.persist({ story })).resolves.toEqual({ ok: true, story });
    });

    it("protects stored state from caller input mutation", async () => {
      const story = makeStory("input-mutation");
      const mutable = { ...story };
      await repository.persist({ story: mutable });

      mutable.title = "Mutated caller input";

      await expect(repository.persist({ story })).resolves.toEqual({ ok: true, story });
    });

    it("protects stored state from successful-result mutation", async () => {
      const story = makeStory("result-mutation");
      const result = await repository.persist({ story });

      if (!result.ok) {
        throw new Error("The Story contract setup write must succeed.");
      }

      (result.story as { title: string }).title = "Mutated successful result";

      await expect(repository.persist({ story })).resolves.toEqual({ ok: true, story });
    });

    it("returns a fresh Story object on every successful call", async () => {
      const story = makeStory("fresh-results");
      const first = await repository.persist({ story });
      const second = await repository.persist({ story });
      const third = await repository.persist({ story });

      if (!first.ok || !second.ok || !third.ok) {
        throw new Error("Every exact Story replay must succeed.");
      }

      expect(first.story).not.toBe(story);
      expect(second.story).not.toBe(first.story);
      expect(third.story).not.toBe(second.story);
      expect([first.story, second.story, third.story]).toEqual([story, story, story]);
    });

    it("exposes readonly commands, results, and branded Story identity", () => {
      expectTypeOf<PersistStoryCommand["story"]["id"]>().toEqualTypeOf<StoryId>();
      expectTypeOf<PersistStoryResult>().toMatchTypeOf<
        | { readonly ok: true; readonly story: Story }
        | { readonly ok: false; readonly error: { readonly storyId: StoryId } }
      >();

      const command: PersistStoryCommand = { story: makeStory("typing") };
      expect(command.story.id).toBe(storyId("story-contract-typing"));
    });
  });
}

function assertReadonlyStoryPersistence(command: PersistStoryCommand): void {
  // @ts-expect-error Persistence commands are readonly.
  command.story = makeStory("changed");
  // @ts-expect-error An ordinary string is not a branded StoryId.
  const invalidStoryId: StoryId = "ordinary-string";
  void invalidStoryId;
}

void assertReadonlyStoryPersistence;

export function createReferenceStoryRepository(): StoryRepository {
  const stories = new Map<StoryId, Story>();

  return {
    async persist(command: PersistStoryCommand): Promise<PersistStoryResult> {
      const existing = stories.get(command.story.id);

      if (existing) {
        if (isDeepStrictEqual(existing, command.story)) {
          return { ok: true, story: structuredClone(existing) };
        }

        return {
          ok: false,
          error: {
            code: "STORY_ID_CONFLICT",
            message: "A different Story with the same Story ID already exists.",
            storyId: command.story.id,
          },
        };
      }

      const stored = structuredClone(command.story);
      stories.set(stored.id, stored);
      return { ok: true, story: structuredClone(stored) };
    },
  };
}
