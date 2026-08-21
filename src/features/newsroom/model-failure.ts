import type { ModelFailureCode } from "@/domain/editorial";

/**
 * Failure codes are the durable record and stay verbatim in the audit panels. Where a failure
 * is reported to the operator as prose, it also needs to say what happened and who can act on
 * it — a quota limit is the operator's own account to fix, and telling them the model rejected
 * the response sends them looking in the wrong place.
 */
const MODEL_FAILURE_EXPLANATIONS: Readonly<Record<ModelFailureCode, string>> = {
  MODEL_AUTHENTICATION_FAILED: "The configured model credential was rejected. Check the API key.",
  MODEL_QUOTA_EXHAUSTED:
    "The model provider account is out of credit or over its quota. The credential is valid; add credit or raise the limit, then run this again.",
  MODEL_REQUEST_TIMED_OUT: "The model did not answer in time. Running it again may succeed.",
  MODEL_REQUEST_FAILED: "The model provider could not be reached. Running it again may succeed.",
  MODEL_RESPONSE_REJECTED: "The model provider refused the request.",
  MODEL_OUTPUT_INVALID: "The model replied in a shape StoryRail could not accept.",
};

export function modelFailureExplanation(code: ModelFailureCode): string {
  return MODEL_FAILURE_EXPLANATIONS[code];
}

/** Operator-facing one-liner: what happened, then the durable code for the audit trail. */
export function modelFailureMessage(
  activity: string,
  failure: { readonly code: ModelFailureCode },
): string {
  return `${activity} failed. ${modelFailureExplanation(failure.code)} (${failure.code})`;
}
