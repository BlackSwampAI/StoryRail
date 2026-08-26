import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import { operatorId, storyId, transitionId, type Story, type StoryState } from "@/domain/editorial";

import { createPublishStory } from "./publish-story";

const UNPUBLISHABLE_STATES = [
  "intake",
  "assigned",
  "in_progress",
  "in_review",
  "changes_requested",
  "rejected",
  "published",
] as const;

const OPERATOR = { type: "operator", operatorId: operatorId("operator-59") } as const;

function story(state: StoryState): Story {
  return {
    id: storyId("story-59"),
    title: "Story",
    state,
    revisionCycle: state === "changes_requested" ? 1 : 0,
    createdAt: "created",
    updatedAt: "updated",
  };
}

function inspection(value: Story): StoryInspection {
  return {
    story: value,
    sources: [],
    assignment: null,
    transitions: [],
    agentRuns: [],
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    article: null,
  };
}

function workflowFor(value: Story) {
  const persist = vi.fn(async (command) => ({
    ok: true as const,
    story: command.story,
    transitionReceipt: command.transitionReceipt,
  }));
  const workflow = createPublishStory({
    inspections: {
      inspect: vi.fn(async () => ({ ok: true as const, inspection: inspection(value) })),
    },
    persistence: { persist },
    createTransitionId: () => transitionId("transition-59"),
    now: () => "published-at",
  });
  return { workflow, persist };
}

describe("publish Story", () => {
  it("persists an operator-owned approved to published transition", async () => {
    const current = story("approved");
    const { workflow, persist } = workflowFor(current);

    await expect(
      workflow({ storyId: current.id, reason: "Cleared for release.", publishedBy: OPERATOR }),
    ).resolves.toMatchObject({
      ok: true,
      story: { state: "published", updatedAt: "published-at" },
      transitionReceipt: {
        previousState: "approved",
        nextState: "published",
        reason: "Cleared for release.",
        actor: OPERATOR,
      },
    });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ expectedStory: current, story: expect.anything() }),
    );
  });

  it.each(UNPUBLISHABLE_STATES)("refuses to publish a %s Story", async (state) => {
    const { workflow, persist } = workflowFor(story(state));

    await expect(
      workflow({ storyId: storyId("story-59"), reason: "Cleared.", publishedBy: OPERATOR }),
    ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
    expect(persist).not.toHaveBeenCalled();
  });

  it("requires an attributable reason", async () => {
    const { workflow, persist } = workflowFor(story("approved"));

    await expect(
      workflow({ storyId: storyId("story-59"), reason: "   ", publishedBy: OPERATOR }),
    ).resolves.toMatchObject({ ok: false });
    expect(persist).not.toHaveBeenCalled();
  });

  it("reports a Story that does not exist without persisting", async () => {
    const persist = vi.fn();
    const workflow = createPublishStory({
      inspections: { inspect: vi.fn(async () => ({ ok: false as const, error: {} as never })) },
      persistence: { persist },
      createTransitionId: () => transitionId("transition-59"),
      now: () => "published-at",
    });

    await expect(
      workflow({ storyId: storyId("story-59"), reason: "Cleared.", publishedBy: OPERATOR }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_NOT_FOUND" } });
    expect(persist).not.toHaveBeenCalled();
  });
});
