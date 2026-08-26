import { describe, expect, it, vi } from "vitest";
import {
  articleBodyMarkdown,
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  reviewDecisionId,
  sourceEvidencePreparationId,
  sourceId,
  storyId,
  transitionId,
  type AgentRun,
} from "@/domain/editorial";
import { createRecordStoryReviewDecision } from "./record-story-review-decision";

function fixture(revisionCycle = 0) {
  const operator = { type: "operator" as const, operatorId: operatorId("operator-38") };
  const story = {
    id: storyId("story-38"),
    title: "Story",
    state: "in_review" as const,
    revisionCycle,
    createdAt: "created",
    updatedAt: "review",
  };
  const writerProfile = {
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
    writerProfileId: writerProfile.id,
    sourceIds: [sourceId("source-38")],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: operator,
    assignedAt: "assigned",
  };
  const article = {
    id: articleId("article-38"),
    storyId: story.id,
    assignmentId: assignment.id,
    createdAt: "drafted",
  };
  const revision = {
    id: articleRevisionId("revision-38"),
    articleId: article.id,
    revisionNumber: 1 as const,
    writerProfileId: writerProfile.id,
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
  };
  const directorRun: AgentRun = {
    id: agentRunId("director-run-38"),
    storyId: story.id,
    profileId: agentProfileId("storyrail-director-v1"),
    role: "editor_in_chief",
    operation: "article_review",
    model: { provider: "openrouter", model: "director" },
    prompt: { key: "storyrail_director_review", version: "1" },
    requestedBy: operator,
    startedAt: "start",
    completedAt: "end",
    input: {
      story: { id: story.id, title: story.title, state: story.state, revisionCycle },
      assignment: {
        id: assignment.id,
        storyId: story.id,
        writerProfileId: writerProfile.id,
        sourceIds: assignment.sourceIds,
        angle: assignment.angle,
        brief: assignment.brief,
        constraints: null,
      },
      article: { id: article.id, assignmentId: assignment.id },
      revision: {
        id: revision.id,
        articleId: article.id,
        revisionNumber: 1,
        writerProfileId: writerProfile.id,
        agentRunId: revision.agentRunId,
        headline: revision.headline,
        dek: null,
        bodyMarkdown: articleBodyMarkdown(revision.blocks),
      },
      evidence: [
        {
          sourceId: sourceId("source-38"),
          relevance: "Primary",
          evidenceKind: "prepared",
          evidenceId: sourceEvidencePreparationId("prep-38"),
        },
      ],
      unavailableSourceIds: [],
    },
    outcome: "succeeded",
    review: {
      recommendation: "request_changes",
      summary: "Needs work.",
      checks: {
        assignment: { status: "pass", note: "Aligned.", quoted: "Quoted from the Article." },
        support: {
          status: "pass" as const,
          note: "Each claim follows from its passage.",
          quoted: "Quoted from the Article.",
        },
        accuracy: {
          status: "needs_changes",
          note: "Support one claim.",
          quoted: "Quoted from the Article.",
        },
        headline: { status: "pass", note: "Supported.", quoted: "Quoted from the Article." },
        structure: { status: "pass", note: "Coherent.", quoted: "Quoted from the Article." },
        style: { status: "pass", note: "Clear.", quoted: "Quoted from the Article." },
      },
      revisionInstructions: "Support the claim.",
    },
  };
  return {
    operator,
    directorRun,
    inspection: {
      story,
      sources: [],
      assignment: { assignment, writerProfile },
      transitions: [],
      agentRuns: [directorRun],
      reviewDecisions: [],
      deliveries: [],
      article: { article, revisions: [revision] },
    },
  };
}

function workflow(facts: ReturnType<typeof fixture>) {
  const persist = vi.fn(async (command) => ({
    ok: true as const,
    decision: command.decision,
    story: command.story,
    transitionReceipt: command.transitionReceipt,
  }));
  return {
    persist,
    run: createRecordStoryReviewDecision({
      inspections: {
        inspect: vi.fn(async () => ({ ok: true as const, inspection: facts.inspection })),
      },
      persistence: { persist },
      createDecisionId: () => reviewDecisionId("decision-38"),
      createTransitionId: () => transitionId("transition-38"),
      now: () => "decided",
    }),
  };
}

describe("record Story review decision", () => {
  it("allows an operator to override a request-changes recommendation with approval", async () => {
    const facts = fixture();
    const { run } = workflow(facts);
    await expect(
      run({
        storyId: facts.inspection.story.id,
        directorRunId: facts.directorRun.id,
        decision: "approve",
        reason: "The evidence is sufficient after operator review.",
        decidedBy: facts.operator,
      }),
    ).resolves.toMatchObject({
      ok: true,
      decision: { decision: "approve", directorRunId: facts.directorRun.id },
      story: { state: "approved" },
      transitionReceipt: { nextState: "approved", actor: facts.operator },
    });
  });

  it("maps request_changes through the state machine and increments the revision cycle", async () => {
    const facts = fixture(1);
    const { run } = workflow(facts);
    await expect(
      run({
        storyId: facts.inspection.story.id,
        directorRunId: facts.directorRun.id,
        decision: "request_changes",
        reason: "Support the claim.",
        decidedBy: facts.operator,
      }),
    ).resolves.toMatchObject({ ok: true, story: { state: "changes_requested", revisionCycle: 2 } });
  });

  it("does not persist when the revision limit is reached", async () => {
    const facts = fixture(2);
    const { run, persist } = workflow(facts);
    await expect(
      run({
        storyId: facts.inspection.story.id,
        directorRunId: facts.directorRun.id,
        decision: "request_changes",
        reason: "More work.",
        decidedBy: facts.operator,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "REVISION_LIMIT_REACHED" } });
    expect(persist).not.toHaveBeenCalled();
  });
});
