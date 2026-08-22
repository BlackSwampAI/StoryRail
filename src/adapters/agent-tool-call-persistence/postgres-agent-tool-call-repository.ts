import type { Pool } from "pg";
import { z } from "zod";

import type { AgentToolCallRepository, AppendAgentToolCallResult } from "@/application/agent-tools";
import {
  TOOL_FAILURE_CODES,
  recordAgentToolCall,
  type AgentRunId,
  type AgentToolCall,
} from "@/domain/editorial";

export class PostgresAgentToolCallInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted tool call.");
    this.name = "PostgresAgentToolCallInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const callSchema = z
  .object({
    id: nonEmpty,
    runId: nonEmpty,
    storyId: nonEmpty,
    sequence: z.number().int().min(1),
    tool: nonEmpty,
    request: z.record(z.string(), z.unknown()),
    requestedAt: nonEmpty,
    completedAt: nonEmpty,
  })
  .and(
    z.union([
      z.object({ outcome: z.literal("succeeded"), result: z.unknown() }),
      z.object({
        outcome: z.literal("failed"),
        failure: z
          .object({
            code: z.enum(TOOL_FAILURE_CODES),
            retryable: z.boolean(),
            message: nonEmpty.nullable(),
          })
          .strict(),
      }),
    ]),
  );

function decode(payload: unknown): AgentToolCall {
  const parsed = callSchema.safeParse(payload);
  if (!parsed.success) throw new PostgresAgentToolCallInvariantError();
  const recorded = recordAgentToolCall(parsed.data as unknown as AgentToolCall);
  if (!recorded.ok) throw new PostgresAgentToolCallInvariantError();
  return recorded.call;
}

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
    async listByRunId(runId: AgentRunId): Promise<readonly AgentToolCall[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT payload FROM storyrail.agent_tool_calls
         WHERE run_id = $1 ORDER BY append_position`,
        [runId],
      );
      return rows.map((row) => decode(row.payload));
    },
  };
}
