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

export type CompleteAgentToolCallResult =
  | { readonly ok: true; readonly call: AgentToolCall }
  | {
      readonly ok: false;
      readonly error: { readonly code: "AGENT_TOOL_CALL_NOT_RUNNING"; readonly message: string };
    };

/**
 * The intent to call a tool is recorded before the call is made, and completed afterwards.
 *
 * Reaching outside the system is the act that must not be able to happen unrecorded. Writing the
 * record afterwards means a process that dies mid-retrieval has influenced nothing that can be
 * seen, and a failure to write the record at all would leave a model acting on material with no
 * durable trace of where it came from.
 */
export interface AgentToolCallRepository {
  append(call: AgentToolCall): Promise<AppendAgentToolCallResult>;
  complete(call: AgentToolCall): Promise<CompleteAgentToolCallResult>;
  listByRunId(runId: AgentRunId): Promise<readonly AgentToolCall[]>;
}
