import type { AgentRunId, AgentToolCallId, StoryId } from "./types";

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const TOOL_FAILURE_CODES = [
  /** The tool is not one this run was given. */
  "TOOL_NOT_AVAILABLE",
  /** The requested arguments did not satisfy the tool's declared schema. */
  "TOOL_REQUEST_INVALID",
  /** The tool declined the request — an unsupported target, or one it will not visit. */
  "TOOL_TARGET_REFUSED",
  /** The tool ran and the work it delegates to failed. */
  "TOOL_EXECUTION_FAILED",
  /** The run had already spent the calls it was allowed. */
  "TOOL_BUDGET_EXHAUSTED",
] as const;
export type ToolFailureCode = (typeof TOOL_FAILURE_CODES)[number];

/**
 * A tool call records what an agent reached for and what came back, not the material itself.
 * Retrieved content becomes evidence with its own immutable record; copying it in here would
 * leave two versions of the same thing and no way to say which was authoritative.
 */
export const MAXIMUM_TOOL_RECORD_CHARACTERS = 4_000;

interface AgentToolCallCommon {
  readonly id: AgentToolCallId;
  readonly runId: AgentRunId;
  readonly storyId: StoryId;
  /** Position within its run, from 1, so the order a run reached for things is durable. */
  readonly sequence: number;
  /**
   * The registered name of the tool, kept open rather than a closed list. Which tools exist is
   * an operator's decision, so the record describes what was called instead of constraining it.
   */
  readonly tool: string;
  readonly request: { readonly [key: string]: JsonValue };
  readonly requestedAt: string;
  readonly completedAt: string;
}

export type AgentToolCall = AgentToolCallCommon &
  (
    | { readonly outcome: "succeeded"; readonly result: JsonValue }
    | {
        readonly outcome: "failed";
        readonly failure: {
          readonly code: ToolFailureCode;
          readonly retryable: boolean;
          readonly message: string | null;
        };
      }
  );

export type AgentToolCallValidationCode =
  | "AGENT_TOOL_CALL_IDENTITY_INVALID"
  | "AGENT_TOOL_CALL_SEQUENCE_INVALID"
  | "AGENT_TOOL_CALL_REQUEST_INVALID"
  | "AGENT_TOOL_CALL_RECORD_TOO_LARGE"
  | "AGENT_TOOL_CALL_OUTCOME_INVALID";

export type RecordAgentToolCallResult =
  | { readonly ok: true; readonly call: AgentToolCall }
  | {
      readonly ok: false;
      readonly error: { readonly code: AgentToolCallValidationCode; readonly message: string };
    };
