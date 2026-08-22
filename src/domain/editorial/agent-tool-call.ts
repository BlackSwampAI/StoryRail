import {
  MAXIMUM_TOOL_RECORD_CHARACTERS,
  TOOL_FAILURE_CODES,
  type AgentToolCall,
  type AgentToolCallValidationCode,
  type RecordAgentToolCallResult,
} from "./agent-tool-call-types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(code: AgentToolCallValidationCode, message: string): RecordAgentToolCallResult {
  return { ok: false, error: { code, message } };
}

function measured(value: unknown): number | null {
  try {
    return JSON.stringify(value ?? null)?.length ?? null;
  } catch {
    // A value that cannot be serialised cannot be recorded, whatever its size.
    return null;
  }
}

/**
 * A tool call is a durable fact about what an agent reached for, recorded whether or not it
 * worked. A run that quietly retried a refused call, or reached for something the operator never
 * granted it, would otherwise leave the same trail as one that behaved.
 */
export function recordAgentToolCall(candidate: AgentToolCall): RecordAgentToolCallResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.runId) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.requestedAt) ||
    !nonEmpty(candidate.completedAt)
  )
    return invalid(
      "AGENT_TOOL_CALL_IDENTITY_INVALID",
      "Tool call identities and timestamps must be non-empty.",
    );

  if (!Number.isInteger(candidate.sequence) || candidate.sequence < 1)
    return invalid(
      "AGENT_TOOL_CALL_SEQUENCE_INVALID",
      "A tool call is positioned within its run from 1.",
    );

  if (!nonEmpty(candidate.tool) || !plainObject(candidate.request))
    return invalid(
      "AGENT_TOOL_CALL_REQUEST_INVALID",
      "A tool call names the tool it used and records the arguments it was given.",
    );

  const requestSize = measured(candidate.request);
  if (requestSize === null || requestSize > MAXIMUM_TOOL_RECORD_CHARACTERS)
    return invalid(
      "AGENT_TOOL_CALL_RECORD_TOO_LARGE",
      "Tool call arguments must be recordable within the audit record's size.",
    );

  if (candidate.outcome === "succeeded") {
    const resultSize = measured(candidate.result);
    if (resultSize === null || resultSize > MAXIMUM_TOOL_RECORD_CHARACTERS)
      return invalid(
        "AGENT_TOOL_CALL_RECORD_TOO_LARGE",
        "A tool result is an audit record, not a copy of the material it retrieved.",
      );
    return { ok: true, call: structuredClone(candidate) };
  }

  if (
    candidate.outcome !== "failed" ||
    !(TOOL_FAILURE_CODES as readonly string[]).includes(candidate.failure.code) ||
    typeof candidate.failure.retryable !== "boolean" ||
    (candidate.failure.message !== null && !nonEmpty(candidate.failure.message))
  )
    return invalid("AGENT_TOOL_CALL_OUTCOME_INVALID", "Failed tool call outcome is invalid.");

  return { ok: true, call: structuredClone(candidate) };
}
