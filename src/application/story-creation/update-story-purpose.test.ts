import { describe, expect, it, vi } from "vitest";

import { operatorId, storyId, type StoryPurpose } from "@/domain/editorial";
import type { StoryRepository, UpdateStoryPurposeResult } from "@/application/story-persistence";
import { createUpdateStoryPurpose } from "./update-story-purpose";

const storyIdentity = storyId("story-purpose-1");
const operator = { type: "operator" as const, operatorId: operatorId("operator-purpose-1") };
const purpose: StoryPurpose = {
  readerValue: " Make transit changes clear ",
  focus: "  Bus routes  ",
};

function harness(
  result: UpdateStoryPurposeResult = {
    ok: false,
    error: { code: "STORY_PURPOSE_LOCKED", message: "Locked." },
  },
) {
  const updatePurpose = vi.fn(async () => result);
  const repository = { updatePurpose } as unknown as StoryRepository;
  const now = vi.fn(() => "2026-10-03T12:00:00.000Z");
  return { workflow: createUpdateStoryPurpose({ repository, now }), updatePurpose, now };
}

describe("createUpdateStoryPurpose", () => {
  it("trims the operator's wording and persists it with operator provenance and the workflow clock", async () => {
    const { workflow, updatePurpose, now } = harness();

    await workflow({ storyId: storyIdentity, purpose, updatedBy: operator });

    expect(updatePurpose).toHaveBeenCalledExactlyOnceWith({
      storyId: storyIdentity,
      purpose: { readerValue: "Make transit changes clear", focus: "Bus routes" },
      updatedBy: operator,
      updatedAt: "2026-10-03T12:00:00.000Z",
    });
    expect(now).toHaveBeenCalledOnce();
  });

  it.each([
    ["empty reader value", { readerValue: " \t ", focus: "Topic" }],
    ["oversized reader value", { readerValue: "x".repeat(2_001), focus: "Topic" }],
    ["oversized focus", { readerValue: "Reader value", focus: "x".repeat(2_001) }],
    ["unexpected field", { readerValue: "Reader value", focus: "Topic", conclusion: "Known" }],
  ] as const)("refuses %s before calling the repository", async (_label, candidate) => {
    const { workflow, updatePurpose, now } = harness();

    await expect(
      workflow({
        storyId: storyIdentity,
        purpose: candidate as unknown as StoryPurpose,
        updatedBy: operator,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_PURPOSE_INVALID" } });
    expect(updatePurpose).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
  });

  it("returns the repository's lock result unchanged", async () => {
    const result: UpdateStoryPurposeResult = {
      ok: false,
      error: { code: "STORY_AGENT_RUN_ACTIVE", message: "An agent is working." },
    };
    const { workflow } = harness(result);

    await expect(workflow({ storyId: storyIdentity, purpose, updatedBy: operator })).resolves.toBe(
      result,
    );
  });
});
