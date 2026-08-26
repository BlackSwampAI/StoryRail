import {
  EDITORIAL_POLICIES,
  POLICY_RUN_CONCLUSIONS,
  POLICY_RUN_STEPS,
  type PolicyRun,
  type PolicyRunValidationCode,
  type RecordPolicyRunResult,
} from "./policy-run-types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function invalid(code: PolicyRunValidationCode, message: string): RecordPolicyRunResult {
  return { ok: false, error: { code, message } };
}

export function recordPolicyRun(candidate: PolicyRun): RecordPolicyRunResult {
  if (
    !nonEmpty(candidate.id) ||
    !(candidate.storyId === null || nonEmpty(candidate.storyId)) ||
    !nonEmpty(candidate.startedAt) ||
    !nonEmpty(candidate.observedAt) ||
    candidate.requestedBy?.type !== "operator" ||
    !nonEmpty(candidate.requestedBy.operatorId)
  )
    return invalid(
      "POLICY_RUN_IDENTITY_INVALID",
      "A policy run records its identity, the Story it has reached, and the operator who authorised it.",
    );

  if (
    !(EDITORIAL_POLICIES as readonly string[]).includes(candidate.policy) ||
    typeof candidate.research !== "boolean"
  )
    return invalid("POLICY_RUN_POLICY_INVALID", "The policy and its options are unsupported.");

  if (!(POLICY_RUN_STEPS as readonly string[]).includes(candidate.step))
    return invalid("POLICY_RUN_STEP_INVALID", "The recorded step is not part of this policy.");

  if (candidate.status === "running") return { ok: true, run: structuredClone(candidate) };

  if (
    candidate.status !== "settled" ||
    !(POLICY_RUN_CONCLUSIONS as readonly string[]).includes(candidate.conclusion) ||
    !nonEmpty(candidate.reason) ||
    !nonEmpty(candidate.completedAt)
  )
    return invalid("POLICY_RUN_OUTCOME_INVALID", "A settled policy run says how it ended and why.");

  return { ok: true, run: structuredClone(candidate) };
}
