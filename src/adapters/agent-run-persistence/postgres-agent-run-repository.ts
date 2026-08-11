import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { AgentRunRepository, AppendAgentRunResult } from "@/application/agent-runs";

import {
  decodePostgresAgentRun,
  PostgresAgentRunInvariantError,
} from "./postgres-agent-run-decoder";

interface AgentRunRow extends QueryResultRow {
  readonly run_id: unknown;
  readonly story_id: unknown;
  readonly profile_id: unknown;
  readonly role: unknown;
  readonly operation: unknown;
  readonly outcome: unknown;
  readonly payload: unknown;
}

export function createPostgresAgentRunRepository(options: {
  readonly pool: Pool;
}): AgentRunRepository {
  return {
    async append(run): Promise<AppendAgentRunResult> {
      const inserted = await options.pool.query<AgentRunRow>(
        `INSERT INTO storyrail.agent_runs
           (run_id, story_id, profile_id, role, operation, outcome, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING run_id, story_id, profile_id, role, operation, outcome, payload`,
        [
          run.id,
          run.storyId,
          run.profileId,
          run.role,
          run.operation,
          run.outcome,
          JSON.stringify(run),
        ],
      );
      if (inserted.rows[0]) return { ok: true, run: decodePostgresAgentRun(inserted.rows[0]) };

      const existing = await options.pool.query<AgentRunRow>(
        `SELECT run_id, story_id, profile_id, role, operation, outcome, payload
         FROM storyrail.agent_runs WHERE run_id = $1`,
        [run.id],
      );
      if (!existing.rows[0]) throw new PostgresAgentRunInvariantError();
      const durable = decodePostgresAgentRun(existing.rows[0]);
      return isDeepStrictEqual(durable, run)
        ? { ok: true, run: structuredClone(durable) }
        : {
            ok: false,
            error: {
              code: "AGENT_RUN_ID_CONFLICT",
              message: "A different AgentRun with the same ID already exists.",
              runId: run.id,
            },
          };
    },
    async listByStoryId(storyId) {
      const result = await options.pool.query<AgentRunRow>(
        `SELECT run_id, story_id, profile_id, role, operation, outcome, payload
         FROM storyrail.agent_runs
         WHERE story_id = $1
         ORDER BY append_position ASC`,
        [storyId],
      );
      return result.rows.map(decodePostgresAgentRun);
    },
  };
}
