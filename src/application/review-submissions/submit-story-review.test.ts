import { describe, expect, it, vi } from "vitest";
import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  storyId,
  transitionId,
} from "@/domain/editorial";
import { createSubmitStoryReview } from "./submit-story-review";

function inspection(state: "in_progress" | "in_review" = "in_progress") {
  const actor = { type: "operator" as const, operatorId: operatorId("operator-38") };
  const story = {
    id: storyId("story-38"),
    title: "Story",
    state,
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "updated",
  };
  const profile = {
    id: agentProfileId("writer-38"),
    role: "writer" as const,
    name: "Writer",
    instructions: "Write.",
    model: null,
    builtIn: true,
  };
  const assignment = {
    id: assignmentId("assignment-38"),
    storyId: story.id,
    writerProfileId: profile.id,
    sourceIds: [],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: actor,
    assignedAt: "assigned",
  };
  const article = {
    id: articleId("article-38"),
    storyId: story.id,
    assignmentId: assignment.id,
    createdAt: "drafted",
  };
  return {
    story,
    sources: [],
    assignment: { assignment, writerProfile: profile },
    transitions: [],
    agentRuns: [],
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    article: {
      article,
      revisions: [
        {
          id: articleRevisionId("revision-38"),
          articleId: article.id,
          revisionNumber: 1 as const,
          writerProfileId: profile.id,
          agentRunId: agentRunId("writer-run-38"),
          headline: "Headline",
          dek: null,
          blocks: [{ kind: "context" as const, markdown: "Body", citations: [] }],
          createdBy: {
            type: "agent" as const,
            role: "writer" as const,
            runId: agentRunId("writer-run-38"),
          },
          createdAt: "drafted",
        },
      ],
    },
  };
}

describe("submit Story for review", () => {
  it("persists an operator-attributed in_progress to in_review transition", async () => {
    const current = inspection();
    const persist = vi.fn(async (command) => ({
      ok: true as const,
      story: command.story,
      transitionReceipt: command.transitionReceipt,
    }));
    const workflow = createSubmitStoryReview({
      inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection: current })) },
      persistence: { persist },
      createTransitionId: () => transitionId("transition-38"),
      now: () => "reviewed",
    });
    await expect(
      workflow({
        storyId: current.story.id,
        submittedBy: current.assignment.assignment.assignedBy,
      }),
    ).resolves.toMatchObject({
      ok: true,
      story: { state: "in_review" },
      transitionReceipt: { actor: { type: "operator" } },
    });
  });

  it("rejects the wrong state, missing Article, and missing revision", async () => {
    const base = inspection("in_review");
    const run = async (value: typeof base) =>
      createSubmitStoryReview({
        inspections: { inspect: vi.fn(async () => ({ ok: true as const, inspection: value })) },
        persistence: { persist: vi.fn() },
        createTransitionId: () => transitionId("unused"),
        now: () => "now",
      })({ storyId: value.story.id, submittedBy: value.assignment.assignment.assignedBy });
    await expect(run(base)).resolves.toMatchObject({
      ok: false,
      error: { code: "REVIEW_SUBMISSION_NOT_ALLOWED" },
    });
    await expect(run({ ...inspection(), article: null } as never)).resolves.toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REQUIRED" },
    });
    await expect(
      run({ ...inspection(), article: { ...inspection().article!, revisions: [] } } as never),
    ).resolves.toMatchObject({ ok: false, error: { code: "ARTICLE_REVISION_REQUIRED" } });
  });
});
