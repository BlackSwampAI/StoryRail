import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentRunRepository,
  AppendAgentRunResult,
  CompleteAgentRunResult,
} from "@/application/agent-runs";

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
      if (!existing.rows[0]) {
        if (run.role === "editor_in_chief" && run.outcome === "succeeded") {
          const successful = await options.pool.query(
            `SELECT run_id FROM storyrail.agent_runs
             WHERE role = 'editor_in_chief' AND operation = 'article_review'
               AND outcome = 'succeeded' AND review_revision_id = $1`,
            [run.input.revision.id],
          );
          if (successful.rows[0])
            return {
              ok: false,
              error: {
                code: "DIRECTOR_REVIEW_ALREADY_SUCCEEDED",
                message: "The Article Revision already has a successful Director review.",
                runId: run.id,
              },
            };
        }
        throw new PostgresAgentRunInvariantError();
      }
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
    async complete(run): Promise<CompleteAgentRunResult> {
      // A run now exists before the model answers, so the Director uniqueness guard has to be
      // applied here as well: appending an in-flight run cannot see a conflict that only a
      // successful outcome creates.
      if (run.role === "editor_in_chief" && run.outcome === "succeeded") {
        const successful = await options.pool.query(
          `SELECT run_id FROM storyrail.agent_runs
           WHERE role = 'editor_in_chief' AND operation = 'article_review'
             AND outcome = 'succeeded' AND review_revision_id = $1 AND run_id <> $2`,
          [run.input.revision.id, run.id],
        );
        if (successful.rows[0]) {
          return {
            ok: false,
            error: {
              code: "DIRECTOR_REVIEW_ALREADY_SUCCEEDED",
              message: "The Article Revision already has a successful Director review.",
              runId: run.id,
            },
          };
        }
      }

      // The WHERE clause is the guard: only a run still in flight can be completed, so a
      // concurrent completion or a replayed request cannot rewrite a terminal outcome. The
      // database trigger enforces the same rule for anything that bypasses this path.
      const updated = await options.pool.query<AgentRunRow>(
        `UPDATE storyrail.agent_runs
         SET outcome = $2, payload = $3::jsonb
         WHERE run_id = $1 AND outcome = 'running'
         RETURNING run_id, story_id, profile_id, role, operation, outcome, payload`,
        [run.id, run.outcome, JSON.stringify(run)],
      );
      if (updated.rows[0]) return { ok: true, run: decodePostgresAgentRun(updated.rows[0]) };

      return {
        ok: false,
        error: {
          code: "AGENT_RUN_NOT_RUNNING",
          message: "Only an AgentRun that is still running can be completed.",
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
