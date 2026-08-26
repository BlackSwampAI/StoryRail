import type { Pool } from "pg";

import type {
  AgentToolCallRepository,
  AppendAgentToolCallResult,
  CompleteAgentToolCallResult,
} from "@/application/agent-tools";
import type { AgentRunId, AgentToolCall } from "@/domain/editorial";

import { decodePostgresAgentToolCall } from "./postgres-agent-tool-call-decoder";

export function createPostgresAgentToolCallRepository(dependencies: {
  readonly pool: Pool;
}): AgentToolCallRepository {
  return {
    async append(call: AgentToolCall): Promise<AppendAgentToolCallResult> {
      try {
        await dependencies.pool.query(
          `INSERT INTO storyrail.agent_tool_calls
             (tool_call_id, run_id, story_id, sequence, tool, outcome, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
          [
            call.id,
            call.runId,
            call.storyId,
            call.sequence,
            call.tool,
            call.outcome,
            JSON.stringify(call),
          ],
        );
        return { ok: true, call };
      } catch (caught) {
        const constraint = (caught as { readonly constraint?: string }).constraint;
        if (constraint === "agent_tool_calls_pkey")
          return {
            ok: false,
            error: {
              code: "AGENT_TOOL_CALL_ID_CONFLICT",
              message: "A tool call with this identity already exists.",
            },
          };
        if (constraint === "agent_tool_calls_run_sequence_key")
          return {
            ok: false,
            error: {
              code: "AGENT_TOOL_CALL_SEQUENCE_CONFLICT",
              message: "This run already recorded a call at that position.",
            },
          };
        throw caught;
      }
    },
    async complete(call: AgentToolCall): Promise<CompleteAgentToolCallResult> {
      const { rowCount } = await dependencies.pool.query(
        `UPDATE storyrail.agent_tool_calls
         SET outcome = $2, payload = $3::jsonb
         WHERE tool_call_id = $1 AND outcome = 'running'`,
        [call.id, call.outcome, JSON.stringify(call)],
      );
      return rowCount === 0
        ? {
            ok: false,
            error: {
              code: "AGENT_TOOL_CALL_NOT_RUNNING",
              message: "The tool call is not in flight.",
            },
          }
        : { ok: true, call };
    },

    async listByRunId(runId: AgentRunId): Promise<readonly AgentToolCall[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT payload FROM storyrail.agent_tool_calls
         WHERE run_id = $1 ORDER BY append_position`,
        [runId],
      );
      return rows.map((row) => decodePostgresAgentToolCall(row.payload));
    },
  };
}
