import type { AgentRunId, AgentToolCall } from "@/domain/editorial";

export type AppendAgentToolCallResult =
  | { readonly ok: true; readonly call: AgentToolCall }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "AGENT_TOOL_CALL_ID_CONFLICT" | "AGENT_TOOL_CALL_SEQUENCE_CONFLICT";
        readonly message: string;
      };
    };

/**
 * Tool calls are appended as they happen rather than gathered at the end of a run, so a run that
 * dies part-way still leaves a record of what it had already reached for.
 */
export interface AgentToolCallRepository {
  append(call: AgentToolCall): Promise<AppendAgentToolCallResult>;
  listByRunId(runId: AgentRunId): Promise<readonly AgentToolCall[]>;
}
