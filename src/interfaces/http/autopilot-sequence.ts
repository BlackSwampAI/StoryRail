import type { StartAssignmentProposalResult } from "@/application/assignment-proposals";
import {
  DIRECTOR_CHECK_NAMES,
  MAX_REVISION_CYCLES,
  agentRunId,
  type AgentRun,
  type AgentRunId,
  type DirectorReviewRecommendation,
  type ModelFailureCode,
  type OperatorActor,
  type PolicyRunId,
  type SourceExtraction,
  type StoryId,
  type UrlSource,
} from "@/domain/editorial";
import type { PolicyRunRepository } from "@/application/policy-runs";
import type {
  AssignmentEditorRuntime,
  DirectorRuntime,
  EvidencePreparationRuntime,
  ResearcherRuntime,
  SourceEvidenceRuntime,
  StoryRuntime,
  WriterRuntime,
} from "@/runtime";

/**
 * Autopilot is an operator-authorised policy, not a replacement for the operator. It decides
 * only *when* each existing workflow runs; every durable record is still written by that
 * workflow, with the operator who started the run as the actor. Two changes in posture are
 * deliberate, and the recorded reasons say so rather than disguising them: the Director's
 * recommendation is adopted as the decision, and no human reads the Article before publication.
 *
 * Several of the fields below are written by an operator when a person is doing this work, and
 * under autopilot there is nobody to write them. They are the audit trail, so what goes in them
 * matters more than that something does. Every one of them is either a fact this system already
 * holds, a judgement a model has already made and recorded, or a plain statement that nobody
 * decided. None of them is generated: a model asked to explain a decision it did not make writes
 * fluent prose that reads like judgement, which is precisely the failure the grounding check
 * exists to prevent for Articles. No reason here costs a model call.
 */
export const AUTOPILOT_ASSIGNMENT_REASON =
  "Assigned by autopilot from the Assignment Editor suggestion.";
export const AUTOPILOT_REVIEW_DECISION_REASON =
  "Adopted the Director recommendation under autopilot.";

/**
 * Why this Source is attached, when no operator has read it.
 *
 * This is the page the operator handed in, so what it is doing here is a fact rather than an
 * assessment: it is the page the run was started from. What nobody knows is what it is worth,
 * and saying so is more useful than a sentence implying somebody weighed it. Anything the
 * Researcher attaches later carries the Researcher's own account instead, because that is a
 * judgement a model actually made about evidence it actually retrieved.
 */
export const AUTOPILOT_SOURCE_RELEVANCE =
  "Autopilot attached the page this run was started from. No operator has judged its relevance.";

/**
 * What the triage decision says, when the machine made it.
 *
 * Triage is where somebody decides what preserved evidence means — a new Story, an existing one,
 * or nothing — on a screen headed with that question. Under autopilot no one does, and the
 * record has to be able to say that rather than look like an operator's call.
 */
export const AUTOPILOT_TRIAGE_REASON =
  "Autopilot opened a Story for this Source without triage by an operator. Nobody read the evidence and decided what it means.";

/**
 * States what happened at publication, rather than describing it.
 *
 * The recommendation is a fact the Director recorded and the checks are facts beside it, so this
 * is assembled from them. A run where the Director approved with a check still wanting changes
 * says so: an operator reading the record afterwards needs to see that, and a fixed sentence
 * claiming nothing failed would be the one sentence in the trail that was not true.
 */
export function autopilotPublicationReason(review: DirectorReviewRecommendation): string {
  const unresolved = DIRECTOR_CHECK_NAMES.filter((name) => review.checks[name].status !== "pass");
  return unresolved.length === 0
    ? `Autopilot published this on the Director's ${review.recommendation} recommendation; no check failed.`
    : `Autopilot published this on the Director's ${review.recommendation} recommendation; ${unresolved.join(", ")} still wanted changes.`;
}

export const AUTOPILOT_STEPS = [
  "source_intake",
  "source_preparation",
  "story_creation",
  "source_attachment",
  "source_triage",
  "source_research",
  "assignment_proposal",
  "assignment",
  "writer_draft",
  "review_submission",
  "director_review",
  "review_decision",
  "writer_revision",
  "publication",
  "delivery",
] as const;
export type AutopilotStep = (typeof AUTOPILOT_STEPS)[number];

export type AutopilotStop =
  /** A supervised run recorded a failure. Autopilot never retries: the failure is the answer. */
  | {
      readonly kind: "agent_run_failed";
      readonly runId: AgentRunId;
      readonly code: ModelFailureCode;
    }
  /** A workflow refused the step, so the Story stays exactly where the domain left it. */
  | { readonly kind: "workflow_refused"; readonly code: string; readonly message: string }
  /** The Director wants further changes but the domain's revision budget is spent. */
  | { readonly kind: "revisions_exhausted" };

/**
 * What became of the published Story.
 *
 * Publication and delivery stay separate concerns: publishing is a durable editorial decision and
 * delivering is an attempt that can fail without unmaking it. Autopilot runs both as consecutive
 * recorded steps, so a run that published and could not deliver is a completed policy with a
 * failed delivery on the record, and nothing is retried.
 */
export type AutopilotDelivery =
  | { readonly kind: "delivered" }
  /** Most newsrooms have nowhere to deliver. Nothing was attempted and nothing was recorded. */
  | { readonly kind: "not_configured" }
  | { readonly kind: "failed"; readonly code: string; readonly message: string };

export type AutopilotResult =
  | {
      readonly ok: true;
      readonly storyId: StoryId;
      readonly revisionCycles: number;
      readonly delivery: AutopilotDelivery;
    }
  | {
      readonly ok: false;
      /** Null for a run that stopped before it had a Story, which is the front of the sequence. */
      readonly storyId: StoryId | null;
      readonly stoppedAt: AutopilotStep;
      readonly stop: AutopilotStop;
    };

export type AutopilotStartFailure = Extract<StartAssignmentProposalResult, { readonly ok: false }>;

export type StartAutopilotResult =
  | {
      readonly ok: true;
      readonly runId: AgentRunId;
      readonly completion: Promise<AutopilotResult>;
    }
  | AutopilotStartFailure;

/**
 * What a run started from a URL can answer with before the response goes back.
 *
 * Intake is performed while the caller waits, exactly as the Assignment Editor is on the
 * Story-first path, because it is the one step whose refusal the operator can do something about:
 * a malformed URL, a page already ingested, an extractor with no key. Everything after it is
 * minutes of model work and resolves through `completion`.
 */
export type StartUrlAutopilotResult =
  | {
      readonly ok: true;
      readonly policyRunId: PolicyRunId | null;
      readonly source: UrlSource;
      readonly completion: Promise<AutopilotResult>;
    }
  | {
      readonly ok: false;
      readonly stage: "preservation" | "extraction" | "policy";
      readonly error: { readonly code: string; readonly message: string };
    };

export interface AutopilotRuntimes {
  /**
   * Where the policy itself is recorded. Without it the sequence is durable step by step and
   * invisible as a whole: a process that dies between two steps leaves nothing saying a Story
   * was under automation at all.
   */
  readonly policyRuns?: PolicyRunRepository;
  /** Present only where an operator has research configured; autopilot works without it. */
  readonly researcher?: Pick<ResearcherRuntime, "researchStorySources">;
  /** Present only for a run started from a URL; a run started at a Story never reaches for it. */
  readonly sourceEvidence?: Pick<SourceEvidenceRuntime, "preserveAndExtractUrlSource">;
  readonly evidencePreparation?: Pick<EvidencePreparationRuntime, "prepareSourceEvidence">;
  readonly story: Pick<
    StoryRuntime,
    | "inspectStory"
    | "createStory"
    | "attachSourceToStory"
    | "recordSourceTriageDecision"
    | "assignStory"
    | "submitStoryReview"
    | "recordStoryReviewDecision"
    | "publishStory"
    | "deliverStory"
  >;
  readonly assignmentEditor: Pick<AssignmentEditorRuntime, "generateAssignmentProposal">;
  readonly writer: Pick<WriterRuntime, "createWriterDraft" | "createWriterRevision">;
  readonly director: Pick<DirectorRuntime, "runDirectorReview">;
}

type WorkflowError = { readonly code: string; readonly message: string };
type RunCompletion<Run extends AgentRun> =
  { readonly ok: true; readonly run: Run } | { readonly ok: false; readonly error: WorkflowError };
interface StartedRun<Run extends AgentRun> {
  readonly ok: true;
  readonly runId: AgentRunId;
  readonly completion: Promise<RunCompletion<Run>>;
}
type SettledRun<Run extends AgentRun> =
  | { readonly ok: true; readonly run: Extract<Run, { readonly outcome: "succeeded" }> }
  | { readonly ok: false; readonly result: AutopilotResult };

function refused(
  storyId: StoryId | null,
  stoppedAt: AutopilotStep,
  error: WorkflowError,
): AutopilotResult {
  return {
    ok: false,
    storyId,
    stoppedAt,
    stop: { kind: "workflow_refused", code: error.code, message: error.message },
  };
}

/**
 * Reduces a settled supervised run to the one thing the sequence needs: the successful run, or
 * the reason to stop. A failed run stops the sequence rather than being retried — free models
 * fail often enough that a silent retry would hide a real problem instead of reporting it.
 */
async function settleRun<Run extends AgentRun>(
  storyId: StoryId,
  stoppedAt: AutopilotStep,
  started: StartedRun<Run>,
): Promise<SettledRun<Run>> {
  const completed = await started.completion;
  if (!completed.ok) return { ok: false, result: refused(storyId, stoppedAt, completed.error) };
  if (completed.run.outcome === "succeeded")
    return { ok: true, run: completed.run as Extract<Run, { readonly outcome: "succeeded" }> };
  const code: ModelFailureCode =
    completed.run.outcome === "failed" ? completed.run.failure.code : "MODEL_REQUEST_FAILED";
  return {
    ok: false,
    result: {
      ok: false,
      storyId,
      stoppedAt,
      stop: { kind: "agent_run_failed", runId: started.runId, code },
    },
  };
}

function succeededExtraction(
  extraction: SourceExtraction,
): Extract<SourceExtraction, { readonly outcome: "succeeded" }> | null {
  return extraction.outcome === "succeeded" ? extraction : null;
}

/**
 * Drives a Story from a URL to a delivered post by invoking the existing workflows in order.
 * It never writes to the database itself, and it stops — leaving the Story exactly where the
 * domain left it — the moment a step will not proceed.
 */
export function createAutopilot(runtimes: AutopilotRuntimes) {
  const { story: stories, assignmentEditor, writer, director } = runtimes;

  /**
   * A run's progress record, and the one place that knows a run may not have a Story yet.
   *
   * Progress is recorded before each step rather than after, so a run that dies inside a step is
   * found at the step it was attempting rather than the last one it finished.
   */
  function tracker(policyRunId: PolicyRunId | null, now: () => string) {
    return {
      async reached(step: AutopilotStep, storyId?: StoryId): Promise<void> {
        if (policyRunId === null || runtimes.policyRuns === undefined) return;
        await runtimes.policyRuns.observe({ id: policyRunId, step, observedAt: now(), storyId });
      },
      async settle(result: AutopilotResult): Promise<AutopilotResult> {
        if (policyRunId === null || runtimes.policyRuns === undefined) return result;
        await runtimes.policyRuns.settle({
          id: policyRunId,
          conclusion: result.ok ? "completed" : "stopped",
          reason: result.ok
            ? result.delivery.kind === "delivered"
              ? "The policy ran to delivery."
              : result.delivery.kind === "not_configured"
                ? "The policy ran to publication. This newsroom has nowhere to deliver."
                : `The policy published and the delivery failed: ${result.delivery.code}.`
            : `Stopped at ${result.stoppedAt}: ${result.stop.kind}.`,
          completedAt: now(),
        });
        return result;
      },
    };
  }

  type Progress = ReturnType<typeof tracker>;

  /**
   * Publishing declares a Story ready; this puts it somewhere, and may fail without unmaking
   * that. A newsroom with nowhere to deliver is the ordinary case rather than a fault, so it is
   * told apart from a delivery that was attempted and failed. Nothing is retried either way.
   */
  async function deliver(storyId: StoryId, progress: Progress): Promise<AutopilotDelivery> {
    await progress.reached("delivery", storyId);
    const delivered = await stories.deliverStory({ storyId });
    if (delivered.ok) return { kind: "delivered" };
    if (delivered.error.code === "DESTINATION_NOT_CONFIGURED") return { kind: "not_configured" };
    return { kind: "failed", code: delivered.error.code, message: delivered.error.message };
  }

  /**
   * The editorial middle, from a proposal to a delivered post.
   *
   * The proposal may already be in flight: the Story-first path starts it before answering the
   * caller so the real preconditions fail fast, and a run that began at a URL has nothing to
   * answer yet and starts it here.
   */
  async function driveFromProposal(
    storyId: StoryId,
    operator: OperatorActor,
    proposalStarted: StartedRun<AgentRun> | null,
    progress: Progress,
  ): Promise<AutopilotResult> {
    await progress.reached("assignment_proposal", storyId);
    const opened =
      proposalStarted ??
      (await assignmentEditor.generateAssignmentProposal({ storyId, requestedBy: operator }));
    if (!opened.ok) return refused(storyId, "assignment_proposal", opened.error);
    const proposed = await settleRun(storyId, "assignment_proposal", opened);
    if (!proposed.ok) return proposed.result;
    if (proposed.run.role !== "assignment_editor")
      return refused(storyId, "assignment_proposal", {
        code: "ASSIGNMENT_PROPOSAL_UNAVAILABLE",
        message: "The Assignment Editor run did not carry a proposal.",
      });
    const { proposal } = proposed.run;

    await progress.reached("assignment", storyId);
    const assigned = await stories.assignStory({
      storyId,
      writerProfileId: proposal.writerProfileId,
      angle: proposal.angle,
      brief: proposal.brief,
      constraints: proposal.constraints,
      reason: AUTOPILOT_ASSIGNMENT_REASON,
      assignedBy: operator,
    });
    if (!assigned.ok) return refused(storyId, "assignment", assigned.error);

    await progress.reached("writer_draft", storyId);
    const draftStarted = await writer.createWriterDraft({ storyId, requestedBy: operator });
    if (!draftStarted.ok) return refused(storyId, "writer_draft", draftStarted.error);
    const drafted = await settleRun(storyId, "writer_draft", draftStarted);
    if (!drafted.ok) return drafted.result;

    // The domain bounds this routing loop: `request_changes` is refused once the revision budget
    // is spent, so autopilot passes through here a fixed number of times at most.
    for (let cycle = 0; cycle <= MAX_REVISION_CYCLES; cycle += 1) {
      await progress.reached("review_submission", storyId);
      const submitted = await stories.submitStoryReview({ storyId, submittedBy: operator });
      if (!submitted.ok) return refused(storyId, "review_submission", submitted.error);

      await progress.reached("director_review", storyId);
      const reviewStarted = await director.runDirectorReview({ storyId, requestedBy: operator });
      if (!reviewStarted.ok) return refused(storyId, "director_review", reviewStarted.error);
      const reviewed = await settleRun(storyId, "director_review", reviewStarted);
      if (!reviewed.ok) return reviewed.result;
      const directorRun = reviewed.run;
      if (directorRun.role !== "editor_in_chief")
        return refused(storyId, "director_review", {
          code: "DIRECTOR_REVIEW_UNAVAILABLE",
          message: "The Director run did not carry a recommendation.",
        });
      const { recommendation } = directorRun.review;

      if (recommendation === "request_changes") {
        // Approving on the Director's behalf once the budget is spent is the one decision
        // autopilot is not authorised to make, so it stops and leaves the Story in review.
        const inspected = await stories.inspectStory(storyId);
        if (!inspected.ok) return refused(storyId, "review_decision", inspected.error);
        if (inspected.inspection.story.revisionCycle >= MAX_REVISION_CYCLES)
          return {
            ok: false,
            storyId,
            stoppedAt: "review_decision",
            stop: { kind: "revisions_exhausted" },
          };
      }

      await progress.reached("review_decision", storyId);
      const decided = await stories.recordStoryReviewDecision({
        storyId,
        directorRunId: directorRun.id,
        decision: recommendation,
        reason: AUTOPILOT_REVIEW_DECISION_REASON,
        decidedBy: operator,
      });
      if (!decided.ok) return refused(storyId, "review_decision", decided.error);

      if (recommendation === "approve") {
        await progress.reached("publication", storyId);
        const published = await stories.publishStory({
          storyId,
          reason: autopilotPublicationReason(directorRun.review),
          publishedBy: operator,
        });
        if (!published.ok) return refused(storyId, "publication", published.error);
        const delivery = await deliver(storyId, progress);
        return { ok: true, storyId, revisionCycles: cycle, delivery };
      }

      await progress.reached("writer_revision", storyId);
      const revisionStarted = await writer.createWriterRevision({
        storyId,
        requestedBy: operator,
      });
      if (!revisionStarted.ok) return refused(storyId, "writer_revision", revisionStarted.error);
      const revised = await settleRun(storyId, "writer_revision", revisionStarted);
      if (!revised.ok) return revised.result;
    }
    return {
      ok: false,
      storyId,
      stoppedAt: "review_decision",
      stop: { kind: "revisions_exhausted" },
    };
  }

  /** Widening the evidence, where an operator asked for it and a Researcher is configured. */
  async function research(
    storyId: StoryId,
    operator: OperatorActor,
    wanted: boolean,
    progress: Progress,
  ): Promise<void> {
    // Research is deliberately not a precondition: every other step feeds the next, but a Story
    // whose research failed is still perfectly writable from the evidence the operator submitted,
    // and stopping would make asking for research riskier than not asking.
    if (!wanted || runtimes.researcher === undefined) return;
    await progress.reached("source_research", storyId);
    const started = await runtimes.researcher.researchStorySources({
      storyId,
      requestedBy: operator,
    });
    if (started.ok) await started.completion;
  }

  /**
   * The front of the sequence: prepared evidence, a Story, an attachment, and a triage decision.
   *
   * Every one of these is an existing workflow with its own durable record. What autopilot has to
   * supply is what an operator would have typed into them, and each of those is either something
   * the system already knows or something nobody knows. The Story's title is the preserved page's
   * own title, which is a fact; the relevance and the triage reason say plainly that no operator
   * judged this. None of it is generated.
   */
  async function driveFromSource(
    source: UrlSource,
    extraction: SourceExtraction,
    operator: OperatorActor,
    wantsResearch: boolean,
    progress: Progress,
  ): Promise<AutopilotResult> {
    if (runtimes.evidencePreparation === undefined)
      return refused(null, "source_preparation", {
        code: "AUTOPILOT_PREPARATION_UNAVAILABLE",
        message: "Evidence preparation is not configured for this newsroom.",
      });
    const extracted = succeededExtraction(extraction);
    if (extracted === null)
      return refused(null, "source_preparation", {
        code: "SOURCE_EXTRACTION_NOT_PREPARABLE",
        message: "The extraction the Story would rest on did not succeed.",
      });

    await progress.reached("source_preparation");
    const prepared = await runtimes.evidencePreparation.prepareSourceEvidence({
      sourceId: source.id,
      extractionId: extracted.id,
      requestedBy: operator,
    });
    if (!prepared.ok) return refused(null, "source_preparation", prepared.error);
    // A preparation that ran and failed is not worked around. Unlike research, which widens
    // evidence the Story does not depend on, this is the only page the Story has; a run that
    // carried on would be writing from evidence the newsroom already knows it could not read.
    if (prepared.preparation.outcome !== "succeeded")
      return refused(null, "source_preparation", {
        code: prepared.preparation.failure.code,
        message: "The evidence this Story would rest on could not be prepared.",
      });

    await progress.reached("story_creation");
    // The preserved page's own title, stated rather than composed, and its canonical URL where
    // the page carried no title. A model asked for a better one would be inventing an editorial
    // line before anybody had read the evidence.
    const created = await stories.createStory({
      title: extracted.document.title ?? source.canonicalUrl,
    });
    if (!created.ok) return refused(null, "story_creation", created.error);
    const storyId = created.story.id;

    await progress.reached("source_attachment", storyId);
    const attached = await stories.attachSourceToStory({
      storyId,
      sourceId: source.id,
      relevance: AUTOPILOT_SOURCE_RELEVANCE,
      attachedBy: operator,
    });
    if (!attached.ok) return refused(storyId, "source_attachment", attached.error);

    // Triage comes after the attachment because the domain requires it to: a Source triaged onto
    // a Story it is not attached to would be a decision about evidence nobody had linked.
    await progress.reached("source_triage", storyId);
    const triaged = await stories.recordSourceTriageDecision({
      sourceId: source.id,
      decision: "new_story",
      storyId,
      reason: AUTOPILOT_TRIAGE_REASON,
      decidedBy: operator,
    });
    if (!triaged.ok) return refused(storyId, "source_triage", triaged.error);

    await research(storyId, operator, wantsResearch, progress);
    return driveFromProposal(storyId, operator, null, progress);
  }

  async function appendPolicyRun(command: {
    readonly storyId: StoryId | null;
    readonly requestedBy: OperatorActor;
    readonly research: boolean;
    readonly step: AutopilotStep;
    readonly createPolicyRunId?: () => PolicyRunId;
    readonly now: () => string;
  }): Promise<
    | { readonly ok: true; readonly id: PolicyRunId | null }
    | { readonly ok: false; readonly message: string }
  > {
    if (runtimes.policyRuns === undefined || command.createPolicyRunId === undefined)
      return { ok: true, id: null };
    const startedAt = command.now();
    const created = await runtimes.policyRuns.append({
      id: command.createPolicyRunId(),
      storyId: command.storyId,
      policy: "autopilot",
      requestedBy: command.requestedBy,
      research: command.research,
      startedAt,
      step: command.step,
      observedAt: startedAt,
      status: "running",
    });
    return created.ok
      ? { ok: true, id: created.run.id }
      : { ok: false, message: created.error.message };
  }

  return {
    /**
     * Starts the run. The Assignment Editor is invoked before the caller is answered, so the
     * real preconditions — an unknown Story, a Story that is not in intake, missing evidence —
     * still fail fast, and the caller gets a durable run identity to follow, exactly as the
     * single-step supervised endpoints do. Everything after that resolves through `completion`.
     */
    async start(command: {
      readonly storyId: StoryId;
      readonly requestedBy: OperatorActor;
      /** Widen the evidence before assigning. Off unless the operator asked for it. */
      readonly research?: boolean;
      readonly createPolicyRunId?: () => PolicyRunId;
      readonly now?: () => string;
    }): Promise<StartAutopilotResult> {
      const now = command.now ?? (() => new Date().toISOString());
      // The policy is recorded before anything runs, so a process that dies at the very first
      // step still leaves something saying this Story was under automation.
      const appended = await appendPolicyRun({
        storyId: command.storyId,
        requestedBy: command.requestedBy,
        research: command.research === true,
        step: command.research === true ? "source_research" : "assignment_proposal",
        createPolicyRunId: command.createPolicyRunId,
        now,
      });
      if (!appended.ok)
        return {
          ok: false,
          error: {
            code: "AGENT_RUN_ID_CONFLICT",
            message: appended.message,
            runId: agentRunId("policy-run-conflict"),
          },
        };
      const progress = tracker(appended.id, now);
      // Research runs before the Assignment Editor sees anything, because the point of it is to
      // change what there is to assign.
      await research(command.storyId, command.requestedBy, command.research === true, progress);
      const started = await assignmentEditor.generateAssignmentProposal({
        storyId: command.storyId,
        requestedBy: command.requestedBy,
      });
      if (!started.ok) {
        // Nothing further will happen, so the policy is settled rather than left in flight for
        // reconciliation to close later as abandoned work it never was.
        await progress.settle(refused(command.storyId, "assignment_proposal", started.error));
        return started;
      }
      return {
        ok: true,
        runId: started.runId,
        completion: driveFromProposal(command.storyId, command.requestedBy, started, progress).then(
          (result) => progress.settle(result),
        ),
      };
    },

    /**
     * Starts the whole sequence from a URL: preserve, extract, prepare, create the Story, attach
     * and triage the Source, write, review, publish, deliver.
     *
     * Intake happens before the caller is answered because its refusals are the ones an operator
     * can act on immediately — a malformed URL, a page this newsroom has already ingested, an
     * extractor with no key — and because everything after it needs the extraction it produces.
     */
    async startFromUrl(command: {
      readonly submittedUrl: string;
      readonly requestedBy: OperatorActor;
      readonly research?: boolean;
      readonly createPolicyRunId?: () => PolicyRunId;
      readonly now?: () => string;
    }): Promise<StartUrlAutopilotResult> {
      const now = command.now ?? (() => new Date().toISOString());
      if (runtimes.sourceEvidence === undefined)
        return {
          ok: false,
          stage: "preservation",
          error: {
            code: "AUTOPILOT_INTAKE_UNAVAILABLE",
            message: "Source intake is not configured for this newsroom.",
          },
        };
      // The policy is recorded before the URL leaves for the extractor, so a process that dies
      // during intake still leaves something saying this URL was under automation. It names no
      // Story because there is not one yet; it learns which Story it made when it makes it.
      const appended = await appendPolicyRun({
        storyId: null,
        requestedBy: command.requestedBy,
        research: command.research === true,
        step: "source_intake",
        createPolicyRunId: command.createPolicyRunId,
        now,
      });
      if (!appended.ok)
        return {
          ok: false,
          stage: "policy",
          error: { code: "POLICY_RUN_ID_CONFLICT", message: appended.message },
        };
      const progress = tracker(appended.id, now);

      const intake = await runtimes.sourceEvidence.preserveAndExtractUrlSource({
        submittedUrl: command.submittedUrl,
        submittedBy: command.requestedBy,
      });
      if (!intake.ok) {
        // The policy is settled here rather than left running: nothing further will happen, and
        // a record that stayed in flight would be reconciled later as abandoned work instead of
        // saying the URL was refused at the door.
        await progress.settle(refused(null, "source_intake", intake.error));
        return { ok: false, stage: intake.stage, error: intake.error };
      }

      return {
        ok: true,
        policyRunId: appended.id,
        source: intake.source,
        completion: driveFromSource(
          intake.source,
          intake.extraction,
          command.requestedBy,
          command.research === true,
          progress,
        ).then((result) => progress.settle(result)),
      };
    },
  };
}

export type Autopilot = ReturnType<typeof createAutopilot>;
