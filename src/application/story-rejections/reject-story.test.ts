import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import { operatorId, storyId, transitionId, type Story, type StoryState } from "@/domain/editorial";
import { createRejectStory } from "./reject-story";

const REJECTABLE_STATES = [
  "intake",
  "assigned",
  "in_progress",
  "in_review",
  "changes_requested",
] as const;

function story(state: StoryState): Story {
  return {
    id: storyId("story-43"),
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
    article: null,
  };
}

function workflowFor(value: Story) {
  const persist = vi.fn(async (command) => ({
    ok: true as const,
    story: command.story,
    transitionReceipt: command.transitionReceipt,
  }));
  const workflow = createRejectStory({
    inspections: {
      inspect: vi.fn(async () => ({ ok: true as const, inspection: inspection(value) })),
    },
    persistence: { persist },
    createTransitionId: () => transitionId("transition-43"),
    now: () => "rejected-at",
  });
  return { workflow, persist };
}

describe("reject Story", () => {
  it.each(REJECTABLE_STATES)(
    "persists an operator-owned %s to rejected transition",
    async (state) => {
      const current = story(state);
      const { workflow, persist } = workflowFor(current);

      await expect(
        workflow({
          storyId: current.id,
          reason: "  Editorial scope no longer warrants coverage.  ",
          rejectedBy: { type: "operator", operatorId: operatorId("operator-43") },
        }),
      ).resolves.toEqual({
        ok: true,
        story: { ...current, state: "rejected", updatedAt: "rejected-at" },
        transitionReceipt: {
          transitionId: transitionId("transition-43"),
          storyId: current.id,
          previousState: state,
          nextState: "rejected",
          actor: { type: "operator", operatorId: operatorId("operator-43") },
          reason: "Editorial scope no longer warrants coverage.",
          occurredAt: "rejected-at",
          revisionCycle: current.revisionCycle,
        },
      });
      expect(persist).toHaveBeenCalledOnce();
    },
  );

  it.each(["approved", "rejected", "published"] as const)(
    "refuses rejection from terminal or post-review state %s without persistence",
    async (state) => {
      const current = story(state);
      const { workflow, persist } = workflowFor(current);

      await expect(
        workflow({
          storyId: current.id,
          reason: "No longer publishing.",
          rejectedBy: { type: "operator", operatorId: operatorId("operator-43") },
        }),
      ).resolves.toMatchObject({ ok: false, error: { code: "INVALID_TRANSITION" } });
      expect(persist).not.toHaveBeenCalled();
    },
  );

  it("requires a reason and reports a missing Story without persistence", async () => {
    const current = story("intake");
    const { workflow, persist } = workflowFor(current);
    await expect(
      workflow({
        storyId: current.id,
        reason: "   ",
        rejectedBy: { type: "operator", operatorId: operatorId("operator-43") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "REASON_REQUIRED" } });
    expect(persist).not.toHaveBeenCalled();

    const missingPersistence = { persist: vi.fn() };
    const missing = createRejectStory({
      inspections: {
        inspect: vi.fn(async () => ({
          ok: false as const,
          error: {
            code: "STORY_NOT_FOUND" as const,
            message: "The Story to inspect does not exist." as const,
            storyId: current.id,
          },
        })),
      },
      persistence: missingPersistence,
      createTransitionId: () => transitionId("unused"),
      now: () => "unused",
    });
    await expect(
      missing({
        storyId: current.id,
        reason: "Reason",
        rejectedBy: { type: "operator", operatorId: operatorId("operator-43") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_NOT_FOUND" } });
    expect(missingPersistence.persist).not.toHaveBeenCalled();
  });

  it("preserves existing Article, review, evidence, and transition history", async () => {
    const current = story("changes_requested");
    const preservedInspection = {
      ...inspection(current),
      sources: [{ durable: "source, attachment, extraction, and prepared evidence" }],
      assignment: { durable: "assignment and Writer Profile" },
      transitions: [{ durable: "earlier transition receipt" }],
      agentRuns: [{ durable: "Writer and Director AgentRuns" }],
      article: { durable: "Article and immutable revisions" },
      reviewDecisions: [{ durable: "Request Changes ReviewDecision" }],
      deliveries: [],
    } as unknown as StoryInspection;
    const before = structuredClone(preservedInspection);
    const persist = vi.fn(async (command) => ({
      ok: true as const,
      story: command.story,
      transitionReceipt: command.transitionReceipt,
    }));
    const workflow = createRejectStory({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: preservedInspection })),
      },
      persistence: { persist },
      createTransitionId: () => transitionId("transition-preservation-43"),
      now: () => "rejected",
    });

    await workflow({
      storyId: current.id,
      reason: "Stop the revision cycle.",
      rejectedBy: { type: "operator", operatorId: operatorId("operator-43") },
    });

    expect(preservedInspection).toEqual(before);
    expect(persist).toHaveBeenCalledWith({
      expectedStory: current,
      story: { ...current, state: "rejected", updatedAt: "rejected" },
      transitionReceipt: expect.objectContaining({
        previousState: "changes_requested",
        nextState: "rejected",
        revisionCycle: current.revisionCycle,
      }),
    });
  });
});
