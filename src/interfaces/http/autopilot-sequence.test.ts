// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  reviewDecisionId,
  storyId,
  type AgentRun,
  type DirectorReviewRecommendation,
  type OperatorActor,
  type Story,
  type StoryState,
} from "@/domain/editorial";

import {
  AUTOPILOT_ASSIGNMENT_REASON,
  AUTOPILOT_PUBLICATION_REASON,
  AUTOPILOT_REVIEW_DECISION_REASON,
  createAutopilot,
  type AutopilotRuntimes,
} from "./autopilot-sequence";

const identity = storyId("story-autopilot-0001");
const operator: OperatorActor = { type: "operator", operatorId: operatorId("operator-autopilot") };
const writerProfile = agentProfileId("storyrail-reporter-v1");
const model = { provider: "openrouter", model: "provider/model" } as const;
const storyInput = {
  id: identity,
  title: "Story",
  state: "intake" as StoryState,
  revisionCycle: 0,
};
const assignmentInput = {
  id: assignmentId("assignment-autopilot"),
  storyId: identity,
  writerProfileId: writerProfile,
  sourceIds: [],
  angle: "Angle",
  brief: "Brief",
  constraints: null,
};
const article = { id: articleId("article-autopilot"), assignmentId: assignmentInput.id };
const revision = {
  id: articleRevisionId("revision-autopilot"),
  articleId: article.id,
  revisionNumber: 1 as const,
  writerProfileId: writerProfile,
  agentRunId: agentRunId("run-writer-draft"),
  headline: "Headline",
  dek: null,
  bodyMarkdown: "Body",
};
const common = {
  storyId: identity,
  model,
  requestedBy: operator,
  startedAt: "2026-01-01T00:00:00.000Z",
  completedAt: "2026-01-01T00:00:01.000Z",
} as const;

function proposalRun(id: string): AgentRun {
  return {
    ...common,
    id: agentRunId(id),
    profileId: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    operation: "assignment_proposal",
    prompt: { key: "storyrail_assignment_editor", version: "1" },
    input: {
      story: storyInput,
      evidence: [],
      unavailableSourceIds: [],
      writerProfileIds: [writerProfile],
    },
    outcome: "succeeded",
    proposal: {
      writerProfileId: writerProfile,
      angle: "Angle",
      brief: "Brief",
      constraints: null,
      reason: "Because the evidence supports it.",
    },
  };
}

function writerRun(id: string, operation: "article_draft" | "article_revision"): AgentRun {
  const base = {
    ...common,
    id: agentRunId(id),
    profileId: writerProfile,
    role: "writer",
    prompt: { key: "storyrail_writer", version: "1" },
    outcome: "succeeded",
    articleId: article.id,
    revisionId: revision.id,
  } as const;
  return operation === "article_draft"
    ? {
        ...base,
        operation,
        input: {
          story: storyInput,
          assignment: assignmentInput,
          evidence: [],
          unavailableSourceIds: [],
        },
      }
    : {
        ...base,
        operation,
        input: {
          story: storyInput,
          assignment: assignmentInput,
          evidence: [],
          unavailableSourceIds: [],
          article,
          revision,
          directorReview: recommendation("request_changes"),
          reviewDecision: {
            id: reviewDecisionId("decision-autopilot"),
            storyId: identity,
            articleId: article.id,
            revisionId: revision.id,
            directorRunId: agentRunId("run-director-1"),
            decision: "request_changes" as const,
            reason: AUTOPILOT_REVIEW_DECISION_REASON,
            decidedBy: operator,
            decidedAt: common.completedAt,
          },
        },
      };
}

function recommendation(value: "approve" | "request_changes"): DirectorReviewRecommendation {
  const check = {
    status: value === "approve" ? ("pass" as const) : ("needs_changes" as const),
    note: "Note",
  };
  return {
    recommendation: value,
    summary: "Summary",
    checks: { assignment: check, accuracy: check, headline: check, structure: check, style: check },
    revisionInstructions: value === "approve" ? null : "Tighten the lede.",
  };
}

function directorRun(id: string, value: "approve" | "request_changes"): AgentRun {
  return {
    ...common,
    id: agentRunId(id),
    profileId: agentProfileId("storyrail-editor-in-chief-v1"),
    role: "editor_in_chief",
    operation: "article_review",
    prompt: { key: "storyrail_director", version: "1" },
    input: {
      story: storyInput,
      assignment: assignmentInput,
      article,
      revision,
      evidence: [],
      unavailableSourceIds: [],
    },
    outcome: "succeeded",
    review: recommendation(value),
  };
}

function failedRun(run: AgentRun): AgentRun {
  return {
    ...run,
    outcome: "failed",
    failure: { code: "MODEL_OUTPUT_INVALID", retryable: true },
  } as AgentRun;
}

const started = (run: AgentRun) => ({
  ok: true as const,
  runId: run.id,
  completion: Promise.resolve({ ok: true as const, run }),
});

function story(state: StoryState, revisionCycle: number): Story {
  return {
    id: identity,
    title: "Story",
    state,
    revisionCycle,
    createdAt: common.startedAt,
    updatedAt: common.completedAt,
  };
}

function runtimes(overrides: {
  readonly directorRuns?: readonly AgentRun[];
  readonly revisionCycles?: readonly number[];
  readonly proposal?: AgentRun;
  readonly draft?: AgentRun;
}): {
  readonly runtimes: AutopilotRuntimes;
  readonly calls: {
    readonly assignStory: ReturnType<typeof vi.fn>;
    readonly submitStoryReview: ReturnType<typeof vi.fn>;
    readonly recordStoryReviewDecision: ReturnType<typeof vi.fn>;
    readonly publishStory: ReturnType<typeof vi.fn>;
    readonly createWriterRevision: ReturnType<typeof vi.fn>;
  };
} {
  const directorRuns = [...(overrides.directorRuns ?? [directorRun("run-director-1", "approve")])];
  const revisionCycles = [...(overrides.revisionCycles ?? [0, 1, 2])];
  const assignStory = vi.fn(async () => ({ ok: true as const }));
  const submitStoryReview = vi.fn(async () => ({ ok: true as const }));
  const recordStoryReviewDecision = vi.fn(async () => ({ ok: true as const }));
  const publishStory = vi.fn(async () => ({ ok: true as const }));
  const createWriterRevision = vi.fn(async () =>
    started(writerRun("run-writer-revision", "article_revision")),
  );
  return {
    calls: {
      assignStory,
      submitStoryReview,
      recordStoryReviewDecision,
      publishStory,
      createWriterRevision,
    },
    runtimes: {
      story: {
        inspectStory: vi.fn(async () => ({
          ok: true as const,
          inspection: {
            story: story("in_review", revisionCycles.shift() ?? 2),
            sources: [],
            assignment: null,
            transitions: [],
            agentRuns: [],
            article: null,
            reviewDecisions: [],
          },
        })),
        assignStory,
        submitStoryReview,
        recordStoryReviewDecision,
        publishStory,
      },
      assignmentEditor: {
        generateAssignmentProposal: vi.fn(async () =>
          started(overrides.proposal ?? proposalRun("run-proposal-1")),
        ),
      },
      writer: {
        createWriterDraft: vi.fn(async () =>
          started(overrides.draft ?? writerRun("run-writer-draft", "article_draft")),
        ),
        createWriterRevision,
      },
      director: {
        runDirectorReview: vi.fn(async () =>
          started(directorRuns.shift() ?? directorRun("run-director-last", "approve")),
        ),
      },
    } as unknown as AutopilotRuntimes,
  };
}

async function complete(harness: ReturnType<typeof runtimes>) {
  const startedRun = await createAutopilot(harness.runtimes).start({
    storyId: identity,
    requestedBy: operator,
  });
  if (!startedRun.ok) throw new Error("autopilot refused to start");
  return { runId: startedRun.runId, result: await startedRun.completion };
}

describe("autopilot sequence", () => {
  it("carries an intake Story through to published, recording the operator as the actor", async () => {
    const harness = runtimes({});
    const { runId, result } = await complete(harness);

    expect(runId).toBe(agentRunId("run-proposal-1"));
    expect(result).toEqual({ ok: true, storyId: identity, revisionCycles: 0 });
    // The proposal is adopted verbatim; only the reason states that autopilot, not a human,
    // turned the suggestion into an Assignment.
    expect(harness.calls.assignStory).toHaveBeenCalledWith({
      storyId: identity,
      writerProfileId: writerProfile,
      angle: "Angle",
      brief: "Brief",
      constraints: null,
      reason: AUTOPILOT_ASSIGNMENT_REASON,
      assignedBy: operator,
    });
    expect(harness.calls.recordStoryReviewDecision).toHaveBeenCalledWith({
      storyId: identity,
      directorRunId: agentRunId("run-director-1"),
      decision: "approve",
      reason: AUTOPILOT_REVIEW_DECISION_REASON,
      decidedBy: operator,
    });
    expect(harness.calls.publishStory).toHaveBeenCalledWith({
      storyId: identity,
      reason: AUTOPILOT_PUBLICATION_REASON,
      publishedBy: operator,
    });
  });

  it("routes the Article back to the Writer once, then publishes on approval", async () => {
    const harness = runtimes({
      directorRuns: [
        directorRun("run-director-1", "request_changes"),
        directorRun("run-director-2", "approve"),
      ],
      revisionCycles: [0],
    });
    const { result } = await complete(harness);

    expect(result).toEqual({ ok: true, storyId: identity, revisionCycles: 1 });
    expect(harness.calls.createWriterRevision).toHaveBeenCalledTimes(1);
    expect(harness.calls.submitStoryReview).toHaveBeenCalledTimes(2);
    expect(harness.calls.publishStory).toHaveBeenCalledTimes(1);
  });

  it("stops at the failed run rather than retrying it", async () => {
    const draft = failedRun(writerRun("run-writer-draft", "article_draft"));
    const harness = runtimes({ draft });
    const { result } = await complete(harness);

    expect(result).toEqual({
      ok: false,
      storyId: identity,
      stoppedAt: "writer_draft",
      stop: { kind: "agent_run_failed", runId: draft.id, code: "MODEL_OUTPUT_INVALID" },
    });
    expect(harness.calls.submitStoryReview).not.toHaveBeenCalled();
  });

  it("leaves the Story in review rather than approving once the revision budget is spent", async () => {
    const harness = runtimes({
      directorRuns: [directorRun("run-director-3", "request_changes")],
      revisionCycles: [2],
    });
    const { result } = await complete(harness);

    expect(result).toEqual({
      ok: false,
      storyId: identity,
      stoppedAt: "review_decision",
      stop: { kind: "revisions_exhausted" },
    });
    expect(harness.calls.recordStoryReviewDecision).not.toHaveBeenCalled();
    expect(harness.calls.createWriterRevision).not.toHaveBeenCalled();
    expect(harness.calls.publishStory).not.toHaveBeenCalled();
  });

  it("stops where a workflow refuses the step", async () => {
    const harness = runtimes({});
    (harness.runtimes.story.assignStory as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      error: { code: "INVALID_TRANSITION", message: "The Story cannot be assigned." },
    });
    const { result } = await complete(harness);

    expect(result).toEqual({
      ok: false,
      storyId: identity,
      stoppedAt: "assignment",
      stop: {
        kind: "workflow_refused",
        code: "INVALID_TRANSITION",
        message: "The Story cannot be assigned.",
      },
    });
    expect(harness.calls.publishStory).not.toHaveBeenCalled();
  });

  it("reports the Assignment Editor precondition instead of starting", async () => {
    const harness = runtimes({});
    (
      harness.runtimes.assignmentEditor.generateAssignmentProposal as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      ok: false,
      error: {
        code: "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED",
        message: "Usable evidence is required.",
        storyId: identity,
      },
    });

    const result = await createAutopilot(harness.runtimes).start({
      storyId: identity,
      requestedBy: operator,
    });

    expect(result.ok).toBe(false);
    expect(harness.calls.assignStory).not.toHaveBeenCalled();
  });
});
