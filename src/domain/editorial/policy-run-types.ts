import type { OperatorActor } from "./types";
import type { PolicyRunId, StoryId } from "./types";

/**
 * The automations an operator can authorise. Closed rather than open: a policy is a sequence
 * this system knows how to drive and how to abandon, not a name a caller can invent.
 */
export const EDITORIAL_POLICIES = ["autopilot"] as const;
export type EditorialPolicy = (typeof EDITORIAL_POLICIES)[number];

export const POLICY_RUN_STEPS = [
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
export type PolicyRunStep = (typeof POLICY_RUN_STEPS)[number];

export const POLICY_RUN_CONCLUSIONS = [
  /** The policy ran to the end of its sequence. */
  "completed",
  /** The policy stopped deliberately: a step refused, or the domain would not allow the next. */
  "stopped",
  /** Nothing reported progress for long enough that the process running it is presumed gone. */
  "abandoned",
] as const;
export type PolicyRunConclusion = (typeof POLICY_RUN_CONCLUSIONS)[number];

interface PolicyRunCommon {
  readonly id: PolicyRunId;
  readonly storyId: StoryId;
  readonly policy: EditorialPolicy;
  readonly requestedBy: OperatorActor;
  /** Whether the operator asked for the evidence to be widened before assigning. */
  readonly research: boolean;
  readonly startedAt: string;
  /** The furthest step the policy is known to have reached. */
  readonly step: PolicyRunStep;
  /** When that step was last recorded. Silence past a threshold is what abandonment means. */
  readonly observedAt: string;
}

/**
 * A record that a Story is under an automated policy, and how far it has got.
 *
 * The editorial history is already durable elsewhere — transitions, agent runs, decisions. This
 * exists to answer a different question: is something in flight, where did it reach, and if the
 * process driving it has gone, what should happen to it. That is why the step is a moving
 * pointer rather than an append-only history: it is a coordination record, not a second copy of
 * what happened.
 */
export type PolicyRun = PolicyRunCommon &
  (
    | { readonly status: "running" }
    | {
        readonly status: "settled";
        readonly conclusion: PolicyRunConclusion;
        readonly reason: string;
        readonly completedAt: string;
      }
  );

export type PolicyRunValidationCode =
  | "POLICY_RUN_IDENTITY_INVALID"
  | "POLICY_RUN_POLICY_INVALID"
  | "POLICY_RUN_STEP_INVALID"
  | "POLICY_RUN_OUTCOME_INVALID";

export type RecordPolicyRunResult =
  | { readonly ok: true; readonly run: PolicyRun }
  | {
      readonly ok: false;
      readonly error: { readonly code: PolicyRunValidationCode; readonly message: string };
    };
