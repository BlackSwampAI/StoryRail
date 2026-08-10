import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  sourceId,
  storyId,
  STORY_STATES,
  type SourceId,
  type Story,
  type StoryId,
} from "@/domain/editorial";

import type { StoryListItem, StoryListingRepository } from "./story-listing-repository";

export interface StoryListingRepositoryContractHarness {
  readonly createRepository: () => StoryListingRepository | Promise<StoryListingRepository>;
  readonly addStory: (story: Story) => void | Promise<void>;
  readonly attachSource: (storyIdentity: StoryId, sourceIdentity: SourceId) => void | Promise<void>;
}

function makeStory(suffix: string, overrides: Partial<Story> = {}): Story {
  return {
    id: storyId(`story-listing-contract-${suffix}`),
    title: `Listed Story ${suffix}`,
    state: "intake",
    revisionCycle: 0,
    createdAt: `opaque-created-${suffix}`,
    updatedAt: `opaque-updated-${suffix}`,
    ...overrides,
  };
}

export function describeStoryListingRepositoryContract(
  createHarness: () =>
    StoryListingRepositoryContractHarness | Promise<StoryListingRepositoryContractHarness>,
): void {
  let repository: StoryListingRepository;
  let addStory: StoryListingRepositoryContractHarness["addStory"];
  let attachSource: StoryListingRepositoryContractHarness["attachSource"];

  beforeEach(async () => {
    const harness = await createHarness();
    repository = await harness.createRepository();
    addStory = harness.addStory;
    attachSource = harness.attachSource;
  });

  describe("StoryListingRepository contract", () => {
    it("returns an empty collection when no Stories exist", async () => {
      await expect(repository.list()).resolves.toEqual([]);
    });

    it("round-trips every authoritative Story fact and counts zero Sources", async () => {
      const story = makeStory("complete", {
        state: "changes_requested",
        revisionCycle: 2,
        createdAt: "opaque created value",
        updatedAt: "opaque updated value",
      });
      await addStory(story);

      await expect(repository.list()).resolves.toEqual([{ story, sourceCount: 0 }]);
    });

    it("counts one and multiple attached Sources without duplicating Stories", async () => {
      const one = makeStory("one-source");
      const many = makeStory("many-sources");
      await addStory(one);
      await addStory(many);
      await attachSource(one.id, sourceId("one-source"));
      await attachSource(many.id, sourceId("many-source-z"));
      await attachSource(many.id, sourceId("many-source-a"));

      const result = await repository.list();
      expect(result).toEqual([
        { story: many, sourceCount: 2 },
        { story: one, sourceCount: 1 },
      ]);
      expect(new Set(result.map(({ story }) => story.id)).size).toBe(2);
    });

    it("lists every domain state", async () => {
      for (const state of STORY_STATES) {
        await addStory(makeStory(state, { state }));
      }

      const result = await repository.list();
      expect(new Set(result.map(({ story }) => story.state))).toEqual(new Set(STORY_STATES));
    });

    it("uses Story identity as deterministic technical order, not opaque timestamps", async () => {
      const first = makeStory("a-identity", {
        id: storyId("a-technical-story"),
        createdAt: "9999-apparently-later",
        updatedAt: "9999-apparently-later",
      });
      const last = makeStory("z-identity", {
        id: storyId("z-technical-story"),
        createdAt: "0000-apparently-earlier",
        updatedAt: "0000-apparently-earlier",
      });
      await addStory(last);
      await addStory(first);

      expect((await repository.list()).map(({ story }) => story.id)).toEqual([first.id, last.id]);
    });

    it("returns fresh results isolated from caller and prior-result mutation", async () => {
      const story = makeStory("isolation");
      await addStory(story);
      const first = await repository.list();
      (story as { title: string }).title = "Mutated caller";
      (first[0]!.story as { title: string }).title = "Mutated result";

      const second = await repository.list();
      expect(second).toEqual([{ story: makeStory("isolation"), sourceCount: 0 }]);
      expect(second).not.toBe(first);
      expect(second[0]).not.toBe(first[0]);
      expect(second[0]!.story).not.toBe(first[0]!.story);
    });

    it("exposes only list with readonly real facts", () => {
      expect(Object.keys(repository)).toEqual(["list"]);
      expectTypeOf<Awaited<ReturnType<StoryListingRepository["list"]>>>().toEqualTypeOf<
        readonly StoryListItem[]
      >();
    });
  });
}

export function createReferenceStoryListingRepositoryHarness(): StoryListingRepositoryContractHarness {
  const stories = new Map<StoryId, Story>();
  const sources = new Map<StoryId, Set<SourceId>>();

  return {
    createRepository: () => ({
      async list() {
        return [...stories.values()]
          .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
          .map((story) => ({
            story: structuredClone(story),
            sourceCount: sources.get(story.id)?.size ?? 0,
          }));
      },
    }),
    addStory(story) {
      stories.set(story.id, structuredClone(story));
    },
    attachSource(storyIdentity, sourceIdentity) {
      const attached = sources.get(storyIdentity) ?? new Set();
      attached.add(sourceIdentity);
      sources.set(storyIdentity, attached);
    },
  };
}
