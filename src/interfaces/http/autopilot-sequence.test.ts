// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  operatorId,
  policyRunId,
  reviewDecisionId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  type AgentRun,
  type DirectorReviewRecommendation,
  type OperatorActor,
  type PolicyRun,
  type Story,
  type StoryState,
} from "@/domain/editorial";

import {
  AUTOPILOT_ASSIGNMENT_REASON,
  AUTOPILOT_REVIEW_DECISION_REASON,
  AUTOPILOT_SOURCE_RELEVANCE,
  AUTOPILOT_TRIAGE_REASON,
  autopilotPublicationReason,
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
    quoted: "Quoted from the Article.",
  };
  return {
    recommendation: value,
    summary: "Summary",
    checks: {
      assignment: check,
      support: check,
      accuracy: check,
      headline: check,
      structure: check,
      style: check,
    },
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
  readonly draftRuns?: readonly AgentRun[];
  readonly draftStart?: Awaited<ReturnType<AutopilotRuntimes["writer"]["createWriterDraft"]>>;
  readonly revisionRuns?: readonly AgentRun[];
}): {
  readonly runtimes: AutopilotRuntimes;
  readonly calls: {
    readonly assignStory: ReturnType<typeof vi.fn>;
    readonly submitStoryReview: ReturnType<typeof vi.fn>;
    readonly recordStoryReviewDecision: ReturnType<typeof vi.fn>;
    readonly publishStory: ReturnType<typeof vi.fn>;
    readonly deliverStory: ReturnType<typeof vi.fn>;
    readonly createWriterRevision: ReturnType<typeof vi.fn>;
    readonly createWriterDraft: ReturnType<typeof vi.fn>;
  };
} {
  const directorRuns = [...(overrides.directorRuns ?? [directorRun("run-director-1", "approve")])];
  const revisionCycles = [...(overrides.revisionCycles ?? [0, 1, 2])];
  const assignStory = vi.fn(async () => ({ ok: true as const }));
  const submitStoryReview = vi.fn(async () => ({ ok: true as const }));
  const recordStoryReviewDecision = vi.fn(async () => ({ ok: true as const }));
  const publishStory = vi.fn(async () => ({ ok: true as const }));
  const deliverStory = vi.fn(async () => ({ ok: true as const, delivery: {} }));
  const revisionRuns = [
    ...(overrides.revisionRuns ?? [writerRun("run-writer-revision", "article_revision")]),
  ];
  const createWriterRevision = vi.fn(async () =>
    started(revisionRuns.shift() ?? writerRun("run-writer-revision-last", "article_revision")),
  );
  const draftRuns = [
    ...(overrides.draftRuns ?? [overrides.draft ?? writerRun("run-writer-draft", "article_draft")]),
  ];
  const createWriterDraft = vi.fn(
    async () =>
      overrides.draftStart ??
      started(draftRuns.shift() ?? writerRun("run-writer-draft-last", "article_draft")),
  );
  return {
    calls: {
      assignStory,
      submitStoryReview,
      recordStoryReviewDecision,
      publishStory,
      deliverStory,
      createWriterRevision,
      createWriterDraft,
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
            deliveries: [],
          },
        })),
        assignStory,
        submitStoryReview,
        recordStoryReviewDecision,
        publishStory,
        deliverStory,
      },
      assignmentEditor: {
        generateAssignmentProposal: vi.fn(async () =>
          started(overrides.proposal ?? proposalRun("run-proposal-1")),
        ),
      },
      writer: {
        createWriterDraft,
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

async function complete(harness: ReturnType<typeof runtimes>, withPolicy = false) {
  const startedRun = await createAutopilot(harness.runtimes).start({
    storyId: identity,
    requestedBy: operator,
    createPolicyRunId: withPolicy ? () => policyRunId("policy-autopilot-test") : undefined,
  });
  if (!startedRun.ok) throw new Error("autopilot refused to start");
  return { runId: startedRun.runId, result: await startedRun.completion };
}

describe("autopilot with research", () => {
  const researcher = (result: unknown) =>
    ({ researchStorySources: vi.fn(async () => result) }) as unknown as NonNullable<
      AutopilotRuntimes["researcher"]
    >;

  it("does not research unless the operator asked for it", async () => {
    const harness = runtimes({});
    const research = researcher({
      ok: true,
      runId: agentRunId("r"),
      completion: Promise.resolve({}),
    });
    await createAutopilot({ ...harness.runtimes, researcher: research }).start({
      storyId: identity,
      requestedBy: operator,
    });

    expect(research.researchStorySources).not.toHaveBeenCalled();
  });

  it("widens the evidence before anything is assigned", async () => {
    // Research exists to change what there is to assign, so it has to finish first.
    const order: string[] = [];
    const harness = runtimes({});
    const research = {
      researchStorySources: vi.fn(async () => {
        order.push("research");
        return { ok: true as const, runId: agentRunId("r"), completion: Promise.resolve({}) };
      }),
    } as unknown as NonNullable<AutopilotRuntimes["researcher"]>;
    (
      harness.runtimes.assignmentEditor.generateAssignmentProposal as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(async () => {
      order.push("assignment");
      return started(proposalRun("run-proposal-1"));
    });

    const startedRun = await createAutopilot({ ...harness.runtimes, researcher: research }).start({
      storyId: identity,
      requestedBy: operator,
      research: true,
    });
    if (startedRun.ok) await startedRun.completion;

    expect(order).toEqual(["research", "assignment"]);
  });

  it("carries on when research fails, because it is enrichment and not a precondition", async () => {
    // Every other step feeds the next. A Story whose research failed is still writable from the
    // evidence the operator submitted, and stopping would make asking for research riskier.
    const harness = runtimes({});
    const research = researcher({
      ok: false,
      error: { code: "RESEARCH_EVIDENCE_REQUIRED", message: "Nothing to research from." },
    });

    const startedRun = await createAutopilot({ ...harness.runtimes, researcher: research }).start({
      storyId: identity,
      requestedBy: operator,
      research: true,
    });

    expect(startedRun.ok).toBe(true);
    if (startedRun.ok)
      expect(await startedRun.completion).toEqual({
        ok: true,
        storyId: identity,
        revisionCycles: 0,
        delivery: { kind: "delivered" },
      });
    expect(harness.calls.publishStory).toHaveBeenCalledOnce();
  });

  it("runs without a Researcher at all when none is configured", async () => {
    const harness = runtimes({});
    const startedRun = await createAutopilot(harness.runtimes).start({
      storyId: identity,
      requestedBy: operator,
      research: true,
    });

    expect(startedRun.ok).toBe(true);
    if (startedRun.ok) expect(await startedRun.completion).toMatchObject({ ok: true });
  });
});

describe("autopilot sequence", () => {
  it("carries an intake Story through to published, recording the operator as the actor", async () => {
    const harness = runtimes({});
    const { runId, result } = await complete(harness);

    expect(runId).toBe(agentRunId("run-proposal-1"));
    expect(result).toEqual({
      ok: true,
      storyId: identity,
      revisionCycles: 0,
      delivery: { kind: "delivered" },
    });
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
      reason: autopilotPublicationReason(recommendation("approve")),
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

    expect(result).toEqual({
      ok: true,
      storyId: identity,
      revisionCycles: 1,
      delivery: { kind: "delivered" },
    });
    expect(harness.calls.createWriterRevision).toHaveBeenCalledTimes(1);
    expect(harness.calls.submitStoryReview).toHaveBeenCalledTimes(2);
    expect(harness.calls.publishStory).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable Writer draft and retains distinct durable run identities", async () => {
    const failed = failedRun(writerRun("run-writer-draft-failed", "article_draft"));
    const succeeded = writerRun("run-writer-draft-succeeded", "article_draft");
    const writerAttempts: number[] = [];
    const harness = runtimes({ draftRuns: [failed, succeeded] });
    const withPolicy = {
      ...harness,
      runtimes: {
        ...harness.runtimes,
        policyRuns: {
          append: vi.fn(async (run: PolicyRun) => ({ ok: true as const, run })),
          observe: vi.fn(async (command: { step: string; attempt: number }) => {
            if (command.step === "writer_draft") writerAttempts.push(command.attempt);
            return { ok: true as const, run: {} as PolicyRun };
          }),
          settle: vi.fn(async () => ({ ok: true as const, run: {} as PolicyRun })),
        } as never,
      },
    } as ReturnType<typeof runtimes>;
    const { result } = await complete(withPolicy, true);

    expect(result).toMatchObject({ ok: true });
    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(2);
    expect([failed.id, succeeded.id]).toEqual([
      agentRunId("run-writer-draft-failed"),
      agentRunId("run-writer-draft-succeeded"),
    ]);
    expect(writerAttempts).toEqual([1, 2]);
  });

  it("stops after exactly three retryable Writer failures with the third run", async () => {
    const failures = [1, 2, 3].map((attempt) =>
      failedRun(writerRun(`run-writer-draft-${attempt}`, "article_draft")),
    );
    const harness = runtimes({ draftRuns: failures });
    const { result } = await complete(harness);

    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      ok: false,
      stop: { kind: "agent_run_failed", runId: failures[2]!.id, code: "MODEL_OUTPUT_INVALID" },
    });
  });

  it("does not retry a non-retryable Writer failure", async () => {
    const draft = {
      ...failedRun(writerRun("run-writer-draft", "article_draft")),
      failure: { code: "MODEL_OUTPUT_INVALID", retryable: false },
    } as AgentRun;
    const harness = runtimes({ draft });
    const { result } = await complete(harness);

    expect(result).toMatchObject({ ok: false, stop: { runId: draft.id } });
    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the Writer runtime refuses to start", async () => {
    const harness = runtimes({
      draftStart: {
        ok: false,
        error: { code: "WRITER_MODEL_UNAVAILABLE", message: "The Writer could not start." },
      },
    });

    const { result } = await complete(harness);

    expect(result).toEqual({
      ok: false,
      storyId: identity,
      stoppedAt: "writer_draft",
      stop: {
        kind: "workflow_refused",
        code: "WRITER_MODEL_UNAVAILABLE",
        message: "The Writer could not start.",
      },
    });
    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(1);
  });

  it("does not retry when Writer run completion cannot be read", async () => {
    const harness = runtimes({
      draftStart: {
        ok: true,
        runId: agentRunId("run-writer-completion-failed"),
        completion: Promise.resolve({
          ok: false,
          error: { code: "WRITER_DRAFT_CONFLICT", message: "The Writer run was unavailable." },
        }),
      },
    });

    const { result } = await complete(harness);

    expect(result).toEqual({
      ok: false,
      storyId: identity,
      stoppedAt: "writer_draft",
      stop: {
        kind: "workflow_refused",
        code: "WRITER_DRAFT_CONFLICT",
        message: "The Writer run was unavailable.",
      },
    });
    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(1);
  });

  it("stops before an unrecorded Writer retry when policy observation fails", async () => {
    const harness = runtimes({
      draftRuns: [
        failedRun(writerRun("run-writer-draft-failed", "article_draft")),
        writerRun("run-writer-draft-never-called", "article_draft"),
      ],
    });
    const observe = vi.fn(async (command: { attempt: number }) =>
      command.attempt === 2
        ? {
            ok: false as const,
            error: { code: "POLICY_RUN_NOT_RUNNING" as const, message: "Policy stopped." },
          }
        : { ok: true as const, run: {} as PolicyRun },
    );
    const withPolicy = {
      ...harness,
      runtimes: {
        ...harness.runtimes,
        policyRuns: {
          append: vi.fn(async (run: PolicyRun) => ({ ok: true as const, run })),
          observe,
          settle: vi.fn(async () => ({ ok: true as const, run: {} as PolicyRun })),
        } as never,
      },
    } as ReturnType<typeof runtimes>;

    const { result } = await complete(withPolicy, true);

    expect(result).toMatchObject({
      ok: false,
      stoppedAt: "writer_draft",
      stop: { kind: "workflow_refused", code: "POLICY_RUN_NOT_RUNNING" },
    });
    expect(harness.calls.createWriterDraft).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable Writer revision and still delivers once", async () => {
    const harness = runtimes({
      directorRuns: [
        directorRun("run-director-1", "request_changes"),
        directorRun("run-director-2", "approve"),
      ],
      revisionCycles: [0],
      revisionRuns: [
        failedRun(writerRun("run-writer-revision-failed", "article_revision")),
        writerRun("run-writer-revision-succeeded", "article_revision"),
      ],
    });

    const { result } = await complete(harness);

    expect(result).toMatchObject({ ok: true });
    expect(harness.calls.createWriterRevision).toHaveBeenCalledTimes(2);
    expect(harness.calls.deliverStory).toHaveBeenCalledTimes(1);
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

describe("autopilot from a URL", () => {
  const source = {
    id: sourceId("source-autopilot"),
    type: "url" as const,
    submittedUrl: "https://newsroom.test/apple-m5-ultra",
    canonicalUrl: "https://newsroom.test/apple-m5-ultra" as never,
    submittedBy: operator,
    receivedAt: common.startedAt,
  };
  const extraction = {
    id: sourceExtractionId("extraction-autopilot"),
    sourceId: source.id,
    extractor: { key: "firecrawl", version: "1" },
    requestedBy: operator,
    startedAt: common.startedAt,
    completedAt: common.completedAt,
    outcome: "succeeded" as const,
    document: {
      format: "markdown" as const,
      content: "The M5 Ultra was announced today.",
      title: "Apple announces the M5 Ultra",
      byline: null,
      publishedAt: null,
      language: null,
    },
  };
  const preparation = {
    id: sourceEvidencePreparationId("preparation-autopilot"),
    sourceId: source.id,
    extractionId: extraction.id,
    outcome: "succeeded" as const,
  };

  function urlHarness(
    overrides: {
      readonly extraction?: unknown;
      readonly preparation?: unknown;
      readonly deliverStory?: unknown;
    } = {},
  ) {
    const base = runtimes({});
    const createStory = vi.fn(async () => ({
      ok: true as const,
      story: story("intake", 0),
    }));
    const attachSourceToStory = vi.fn(async () => ({ ok: true as const }));
    const recordSourceTriageDecision = vi.fn(async () => ({ ok: true as const }));
    const preserveUrlSource = vi.fn(async () => ({ ok: true as const, source }));
    const extractPersistedSource = vi.fn(async () => ({
      ok: true as const,
      extraction: overrides.extraction ?? extraction,
    }));
    const prepareSourceEvidence = vi.fn(async () => ({
      ok: true as const,
      preparation: overrides.preparation ?? preparation,
    }));
    const calls = {
      ...base.calls,
      createStory,
      attachSourceToStory,
      recordSourceTriageDecision,
      preserveUrlSource,
      extractPersistedSource,
      prepareSourceEvidence,
    };
    return {
      calls,
      runtimes: {
        ...base.runtimes,
        story: {
          ...base.runtimes.story,
          createStory,
          attachSourceToStory,
          recordSourceTriageDecision,
          ...(overrides.deliverStory === undefined ? {} : { deliverStory: overrides.deliverStory }),
        },
        sourceEvidence: { preserveUrlSource, extractPersistedSource },
        evidencePreparation: { prepareSourceEvidence },
      } as unknown as AutopilotRuntimes,
    };
  }

  async function runFromUrl(harness: ReturnType<typeof urlHarness>) {
    const started = await createAutopilot(harness.runtimes).startFromUrl({
      submittedUrl: source.submittedUrl,
      requestedBy: operator,
    });
    if (!started.ok) throw new Error(`autopilot refused to start: ${started.error.code}`);
    return { source: started.source, result: await started.completion };
  }

  it("takes a URL and reaches a delivered post without an operator touching it", async () => {
    const harness = urlHarness();
    const { result } = await runFromUrl(harness);

    expect(harness.calls.preserveUrlSource).toHaveBeenCalledWith({
      submittedUrl: source.submittedUrl,
      submittedBy: operator,
    });
    expect(harness.calls.extractPersistedSource).toHaveBeenCalledWith({
      sourceId: source.id,
      requestedBy: operator,
    });
    expect(harness.calls.prepareSourceEvidence).toHaveBeenCalledWith({
      sourceId: source.id,
      extractionId: extraction.id,
      requestedBy: operator,
    });
    expect(harness.calls.createStory).toHaveBeenCalledTimes(1);
    expect(harness.calls.attachSourceToStory).toHaveBeenCalledTimes(1);
    expect(harness.calls.recordSourceTriageDecision).toHaveBeenCalledTimes(1);
    expect(harness.calls.publishStory).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      storyId: identity,
      revisionCycles: 0,
      delivery: { kind: "delivered" },
    });
  });

  it("names the Story after the page it preserved rather than composing one", async () => {
    const harness = urlHarness();
    await runFromUrl(harness);

    expect(harness.calls.createStory).toHaveBeenCalledWith({
      title: "Apple announces the M5 Ultra",
    });
  });

  it("falls back to the canonical URL when the page carried no title of its own", async () => {
    const harness = urlHarness({
      extraction: { ...extraction, document: { ...extraction.document, title: null } },
    });
    await runFromUrl(harness);

    expect(harness.calls.createStory).toHaveBeenCalledWith({ title: source.canonicalUrl });
  });

  it("says plainly that nobody judged the Source it attached", async () => {
    const harness = urlHarness();
    await runFromUrl(harness);

    const [attachment] = harness.calls.attachSourceToStory.mock.calls[0] as unknown as [
      { readonly relevance: string },
    ];
    expect(attachment.relevance).toBe(AUTOPILOT_SOURCE_RELEVANCE);
    expect(attachment.relevance).toMatch(/No operator has judged its relevance/);
  });

  it("records a triage nobody made as one nobody made", async () => {
    const harness = urlHarness();
    await runFromUrl(harness);

    expect(harness.calls.recordSourceTriageDecision).toHaveBeenCalledWith({
      sourceId: source.id,
      decision: "new_story",
      storyId: identity,
      reason: AUTOPILOT_TRIAGE_REASON,
      decidedBy: operator,
    });
    expect(AUTOPILOT_TRIAGE_REASON).toMatch(/without triage by an operator/);
  });

  it("delivers what it published, as a step of its own", async () => {
    const harness = urlHarness();
    await runFromUrl(harness);

    expect(harness.calls.publishStory).toHaveBeenCalledTimes(1);
    expect(harness.calls.deliverStory).toHaveBeenCalledWith({ storyId: identity });
  });

  it("leaves the Story published when the delivery fails, and retries nothing", async () => {
    const deliverStory = vi.fn(async () => ({
      ok: false as const,
      error: { code: "DESTINATION_REJECTED", message: "The destination refused the page." },
    }));
    const harness = urlHarness({ deliverStory });
    const { result } = await runFromUrl(harness);

    expect(harness.calls.publishStory).toHaveBeenCalledTimes(1);
    expect(deliverStory).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      storyId: identity,
      revisionCycles: 0,
      delivery: {
        kind: "failed",
        code: "DESTINATION_REJECTED",
        message: "The destination refused the page.",
      },
    });
  });

  it("stops on required delivery reconciliation and never retries", async () => {
    const deliverStory = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "DESTINATION_RECONCILIATION_REQUIRED",
        message: "Check the destination before delivering again.",
        deliveryId: "delivery-unknown",
        destination: "wordpress",
        destinationInstanceId: "wordpress:https://newsroom.test",
        operation: "create" as const,
        slug: "uncertain-report",
        remoteId: null,
      },
    }));
    const { result } = await runFromUrl(urlHarness({ deliverStory }));

    expect(deliverStory).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      delivery: { kind: "failed", code: "DESTINATION_RECONCILIATION_REQUIRED" },
    });
  });

  it("treats a newsroom with nowhere to deliver as finished rather than failed", async () => {
    const deliverStory = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "DESTINATION_NOT_CONFIGURED",
        message: "This newsroom has no destination.",
      },
    }));
    const { result } = await runFromUrl(urlHarness({ deliverStory }));

    expect(result).toEqual({
      ok: true,
      storyId: identity,
      revisionCycles: 0,
      delivery: { kind: "not_configured" },
    });
  });

  it("stops before opening a Story when the evidence it would rest on cannot be prepared", async () => {
    const harness = urlHarness({
      preparation: {
        ...preparation,
        outcome: "failed",
        failure: { code: "MODEL_OUTPUT_INVALID", retryable: true },
      },
    });
    const { result } = await runFromUrl(harness);

    expect(result).toEqual({
      ok: false,
      storyId: null,
      stoppedAt: "source_preparation",
      stop: {
        kind: "workflow_refused",
        code: "MODEL_OUTPUT_INVALID",
        message: "The evidence this Story would rest on could not be prepared.",
      },
    });
    expect(harness.calls.createStory).not.toHaveBeenCalled();
    expect(harness.calls.prepareSourceEvidence).toHaveBeenCalledTimes(1);
  });

  it("refuses the URL at the door rather than automating anything", async () => {
    const harness = urlHarness();
    (
      harness.runtimes.sourceEvidence!.preserveUrlSource as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      ok: false,
      stage: "preservation",
      error: { code: "DUPLICATE_SOURCE", message: "This newsroom already has that page." },
    });

    const started = await createAutopilot(harness.runtimes).startFromUrl({
      submittedUrl: source.submittedUrl,
      requestedBy: operator,
    });

    expect(started).toEqual({
      ok: false,
      stage: "preservation",
      error: { code: "DUPLICATE_SOURCE", message: "This newsroom already has that page." },
    });
    expect(harness.calls.createStory).not.toHaveBeenCalled();
  });

  it("records the whole journey against the policy run, learning its Story on the way", async () => {
    const observed: Array<{ readonly step: string; readonly storyId?: string }> = [];
    const settled: unknown[] = [];
    const harness = urlHarness();
    const withPolicy = {
      ...harness.runtimes,
      policyRuns: {
        append: vi.fn(async (run: unknown) => ({ ok: true as const, run })),
        observe: vi.fn(async (command: { step: string; storyId?: string }) => {
          observed.push({ step: command.step, storyId: command.storyId });
          return { ok: true as const, run: {} };
        }),
        settle: vi.fn(async (command: unknown) => {
          settled.push(command);
          return { ok: true as const, run: {} };
        }),
      },
    } as unknown as AutopilotRuntimes;

    const started = await createAutopilot(withPolicy).startFromUrl({
      submittedUrl: source.submittedUrl,
      requestedBy: operator,
      createPolicyRunId: () => policyRunId("policy-url-run"),
    });
    if (!started.ok) throw new Error("autopilot refused to start");
    await started.completion;

    const append = withPolicy.policyRuns!.append as ReturnType<typeof vi.fn>;
    expect(harness.calls.preserveUrlSource.mock.invocationCallOrder[0]!).toBeLessThan(
      append.mock.invocationCallOrder[0]!,
    );
    expect(append.mock.invocationCallOrder[0]!).toBeLessThan(
      harness.calls.extractPersistedSource.mock.invocationCallOrder[0]!,
    );
    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: null,
        sourceId: source.id,
        step: "source_intake",
        attempt: 1,
      }),
    );

    expect(observed.map(({ step }) => step)).toEqual([
      "source_preparation",
      "story_creation",
      "source_attachment",
      "source_triage",
      "assignment_proposal",
      "assignment",
      "writer_draft",
      "review_submission",
      "director_review",
      "review_decision",
      "publication",
      "delivery",
    ]);
    // The run is written before there is a Story and learns which one it made when it makes it.
    expect(observed[0]?.storyId).toBeUndefined();
    expect(observed.find(({ storyId }) => storyId !== undefined)).toEqual({
      step: "source_attachment",
      storyId: identity,
    });
    expect(observed.at(-1)?.storyId).toBe(identity);
    expect(settled).toHaveLength(1);
  });

  it("leaves what the Researcher attaches described in the Researcher's own words", async () => {
    // The Researcher writes its own relevance for anything it attaches, and that judgement is
    // about evidence it actually retrieved. Autopilot describes only the page it was handed;
    // asking for a second account of the rest would be inventing a second opinion.
    const harness = urlHarness();
    const researchStorySources = vi.fn(async () => ({
      ok: true,
      runId: agentRunId("run-research"),
      completion: Promise.resolve({}),
    }));
    const started = await createAutopilot({
      ...harness.runtimes,
      researcher: { researchStorySources },
    } as unknown as AutopilotRuntimes).startFromUrl({
      submittedUrl: source.submittedUrl,
      requestedBy: operator,
      research: true,
    });
    if (!started.ok) throw new Error("autopilot refused to start");
    await started.completion;

    expect(researchStorySources).toHaveBeenCalledTimes(1);
    expect(harness.calls.attachSourceToStory).toHaveBeenCalledTimes(1);
  });

  it("does not create a policy when preserving the URL is refused", async () => {
    const harness = urlHarness();
    (
      harness.runtimes.sourceEvidence!.preserveUrlSource as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      ok: false,
      stage: "preservation",
      error: { code: "INVALID_SOURCE_URL", message: "That is not a URL." },
    });
    const withPolicy = {
      ...harness.runtimes,
      policyRuns: {
        append: vi.fn(async (run: unknown) => ({ ok: true as const, run })),
        observe: vi.fn(async () => ({ ok: true as const, run: {} })),
        settle: vi.fn(),
      },
    } as unknown as AutopilotRuntimes;

    await createAutopilot(withPolicy).startFromUrl({
      submittedUrl: "not-a-url",
      requestedBy: operator,
      createPolicyRunId: () => policyRunId("policy-url-refused"),
    });

    expect(withPolicy.policyRuns!.append).not.toHaveBeenCalled();
    expect(withPolicy.policyRuns!.settle).not.toHaveBeenCalled();
  });
});

describe("what autopilot may say about itself", () => {
  it("states the recommendation it followed instead of judging the Article", () => {
    const reason = autopilotPublicationReason(recommendation("approve"));

    expect(reason).toBe(
      "Autopilot published this on the Director's approve recommendation; no check failed.",
    );
  });

  it("names a check that still wanted changes rather than claiming none did", () => {
    const review = recommendation("approve");
    const reason = autopilotPublicationReason({
      ...review,
      checks: {
        ...review.checks,
        accuracy: { ...review.checks.accuracy, status: "needs_changes" },
      },
    });

    expect(reason).toBe(
      "Autopilot published this on the Director's approve recommendation; accuracy still wanted changes.",
    );
  });

  it("writes every reason it needs without asking a model for one", async () => {
    // Every reason autopilot writes is a module constant or is assembled from records that
    // already exist. If one of them ever needed a model, this list would have to grow.
    const reasons = [
      AUTOPILOT_ASSIGNMENT_REASON,
      AUTOPILOT_REVIEW_DECISION_REASON,
      AUTOPILOT_SOURCE_RELEVANCE,
      AUTOPILOT_TRIAGE_REASON,
      autopilotPublicationReason(recommendation("approve")),
    ];

    expect(reasons.every((reason) => reason.trim().length > 0)).toBe(true);
    expect(reasons.filter((reason) => reason.startsWith("Autopilot"))).toHaveLength(3);
  });
});
