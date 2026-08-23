import type { StartAssignmentProposalResult } from "@/application/assignment-proposals";
import {
  MAX_REVISION_CYCLES,
  agentRunId,
  type AgentRun,
  type AgentRunId,
  type ModelFailureCode,
  type OperatorActor,
  type PolicyRunId,
  type StoryId,
} from "@/domain/editorial";
import type { PolicyRunRepository } from "@/application/policy-runs";
import type {
  AssignmentEditorRuntime,
  DirectorRuntime,
  ResearcherRuntime,
  StoryRuntime,
  WriterRuntime,
} from "@/runtime";

/**
 * Autopilot is an operator-authorised policy, not a replacement for the operator. It decides
 * only *when* each existing workflow runs; every durable record is still written by that
 * workflow, with the operator who started the run as the actor. Two changes in posture are
 * deliberate, and the recorded reasons say so rather than disguising them: the Director's
 * recommendation is adopted as the decision, and no human reads the Article before publication.
 */
export const AUTOPILOT_ASSIGNMENT_REASON =
  "Assigned by autopilot from the Assignment Editor suggestion.";
export const AUTOPILOT_REVIEW_DECISION_REASON =
  "Adopted the Director recommendation under autopilot.";
export const AUTOPILOT_PUBLICATION_REASON = "Published by autopilot after Director approval.";

export const AUTOPILOT_STEPS = [
  "source_research",
  "assignment_proposal",
  "assignment",
  "writer_draft",
  "review_submission",
  "director_review",
  "review_decision",
  "writer_revision",
  "publication",
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

export type AutopilotResult =
  | { readonly ok: true; readonly storyId: StoryId; readonly revisionCycles: number }
  | {
      readonly ok: false;
      readonly storyId: StoryId;
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

export interface AutopilotRuntimes {
  /**
   * Where the policy itself is recorded. Without it the sequence is durable step by step and
   * invisible as a whole: a process that dies between two steps leaves nothing saying a Story
   * was under automation at all.
   */
  readonly policyRuns?: PolicyRunRepository;
  /** Present only where an operator has research configured; autopilot works without it. */
  readonly researcher?: Pick<ResearcherRuntime, "researchStorySources">;
  readonly story: Pick<
    StoryRuntime,
    | "inspectStory"
    | "assignStory"
    | "submitStoryReview"
    | "recordStoryReviewDecision"
    | "publishStory"
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
  storyId: StoryId,
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

/**
 * Drives one Story from `intake` to `published` by invoking the existing workflows in order.
 * It never writes to the database itself, and it stops — leaving the Story exactly where the
 * domain left it — the moment a step will not proceed.
 */
export function createAutopilot(runtimes: AutopilotRuntimes) {
  const { story: stories, assignmentEditor, writer, director } = runtimes;

  async function drive(
    storyId: StoryId,
    operator: OperatorActor,
    proposalStarted: StartedRun<AgentRun>,
    policyRunId: PolicyRunId | null,
    now: () => string,
  ): Promise<AutopilotResult> {
    // Progress is recorded before each step rather than after, so a run that dies inside a step
    // is found at the step it was attempting rather than the last one it finished.
    const reached = async (step: AutopilotStep): Promise<void> => {
      if (policyRunId === null || runtimes.policyRuns === undefined) return;
      await runtimes.policyRuns.observe({ id: policyRunId, step, observedAt: now() });
    };
    const settle = async (result: AutopilotResult): Promise<AutopilotResult> => {
      if (policyRunId !== null && runtimes.policyRuns !== undefined)
        await runtimes.policyRuns.settle({
          id: policyRunId,
          conclusion: result.ok ? "completed" : "stopped",
          reason: result.ok
            ? "The policy ran to publication."
            : `Stopped at ${result.stoppedAt}: ${result.stop.kind}.`,
          completedAt: now(),
        });
      return result;
    };
    const outcome = await (async (): Promise<AutopilotResult> => {
      await reached("assignment_proposal");
      const proposed = await settleRun(storyId, "assignment_proposal", proposalStarted);
      if (!proposed.ok) return proposed.result;
      if (proposed.run.role !== "assignment_editor")
        return refused(storyId, "assignment_proposal", {
          code: "ASSIGNMENT_PROPOSAL_UNAVAILABLE",
          message: "The Assignment Editor run did not carry a proposal.",
        });
      const { proposal } = proposed.run;

      await reached("assignment");
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

      await reached("writer_draft");
      const draftStarted = await writer.createWriterDraft({ storyId, requestedBy: operator });
      if (!draftStarted.ok) return refused(storyId, "writer_draft", draftStarted.error);
      const drafted = await settleRun(storyId, "writer_draft", draftStarted);
      if (!drafted.ok) return drafted.result;

      // The domain bounds this routing loop: `request_changes` is refused once the revision budget
      // is spent, so autopilot passes through here a fixed number of times at most.
      for (let cycle = 0; cycle <= MAX_REVISION_CYCLES; cycle += 1) {
        await reached("review_submission");
        const submitted = await stories.submitStoryReview({ storyId, submittedBy: operator });
        if (!submitted.ok) return refused(storyId, "review_submission", submitted.error);

        await reached("director_review");
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

        await reached("review_decision");
        const decided = await stories.recordStoryReviewDecision({
          storyId,
          directorRunId: directorRun.id,
          decision: recommendation,
          reason: AUTOPILOT_REVIEW_DECISION_REASON,
          decidedBy: operator,
        });
        if (!decided.ok) return refused(storyId, "review_decision", decided.error);

        if (recommendation === "approve") {
          await reached("publication");
          const published = await stories.publishStory({
            storyId,
            reason: AUTOPILOT_PUBLICATION_REASON,
            publishedBy: operator,
          });
          if (!published.ok) return refused(storyId, "publication", published.error);
          return { ok: true, storyId, revisionCycles: cycle };
        }

        await reached("writer_revision");
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
    })();
    return settle(outcome);
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
      let policyRunId: PolicyRunId | null = null;
      if (runtimes.policyRuns !== undefined && command.createPolicyRunId !== undefined) {
        const startedAt = now();
        const created = await runtimes.policyRuns.append({
          id: command.createPolicyRunId(),
          storyId: command.storyId,
          policy: "autopilot",
          requestedBy: command.requestedBy,
          research: command.research === true,
          startedAt,
          step: command.research === true ? "source_research" : "assignment_proposal",
          observedAt: startedAt,
          status: "running",
        });
        if (!created.ok)
          return {
            ok: false,
            error: {
              code: "AGENT_RUN_ID_CONFLICT",
              message: created.error.message,
              runId: agentRunId(created.error.code),
            },
          };
        policyRunId = created.run.id;
      }
      // Research runs before the Assignment Editor sees anything, because the point of it is to
      // change what there is to assign. It is deliberately not a precondition: every other step
      // feeds the next, but a Story whose research failed is still perfectly writable from the
      // evidence the operator submitted, and stopping would make asking for research riskier
      // than not asking.
      if (command.research === true && runtimes.researcher !== undefined) {
        const research = await runtimes.researcher.researchStorySources({
          storyId: command.storyId,
          requestedBy: command.requestedBy,
        });
        if (research.ok) await research.completion;
      }
      const started = await assignmentEditor.generateAssignmentProposal({
        storyId: command.storyId,
        requestedBy: command.requestedBy,
      });
      if (!started.ok) return started;
      return {
        ok: true,
        runId: started.runId,
        completion: drive(command.storyId, command.requestedBy, started, policyRunId, now),
      };
    },
  };
}

export type Autopilot = ReturnType<typeof createAutopilot>;
