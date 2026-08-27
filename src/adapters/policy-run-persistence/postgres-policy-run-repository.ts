import type { Pool } from "pg";
import { z } from "zod";

import type {
  AppendPolicyRunResult,
  PolicyRunRepository,
  UpdatePolicyRunResult,
} from "@/application/policy-runs";
import {
  EDITORIAL_POLICIES,
  POLICY_RUN_CONCLUSIONS,
  POLICY_RUN_STEPS,
  recordPolicyRun,
  type PolicyRun,
  type PolicyRunId,
  type SiteId,
  type StoryId,
} from "@/domain/editorial";

export class PostgresPolicyRunInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted policy run.");
    this.name = "PostgresPolicyRunInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const common = {
  id: nonEmpty,
  storyId: nonEmpty.nullable(),
  sourceId: nonEmpty.nullable(),
  policy: z.enum(EDITORIAL_POLICIES),
  requestedBy: z.object({ type: z.literal("operator"), operatorId: nonEmpty }).strict(),
  research: z.boolean(),
  startedAt: nonEmpty,
  step: z.enum(POLICY_RUN_STEPS),
  observedAt: nonEmpty,
};
const schema = z.union([
  z.object({ ...common, status: z.literal("running") }).strict(),
  z
    .object({
      ...common,
      status: z.literal("settled"),
      conclusion: z.enum(POLICY_RUN_CONCLUSIONS),
      reason: nonEmpty,
      completedAt: nonEmpty,
    })
    .strict(),
]);

function decode(payload: unknown): PolicyRun {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PostgresPolicyRunInvariantError();
  const recorded = recordPolicyRun(parsed.data as unknown as PolicyRun);
  if (!recorded.ok) throw new PostgresPolicyRunInvariantError();
  return recorded.run;
}

export function createPostgresPolicyRunRepository(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): PolicyRunRepository {
  const readOne = async (id: PolicyRunId): Promise<PolicyRun> => {
    const { rows } = await dependencies.pool.query<{ payload: unknown }>(
      `SELECT run.payload FROM storyrail.policy_runs AS run
       LEFT JOIN storyrail.stories AS story ON story.story_id = run.story_id
       LEFT JOIN storyrail.url_sources AS source ON source.source_id = run.source_id
       WHERE run.policy_run_id = $1 AND COALESCE(story.site_id, source.site_id) = $2`,
      [id, dependencies.siteId],
    );
    if (rows[0] === undefined) throw new PostgresPolicyRunInvariantError();
    return decode(rows[0].payload);
  };

  return {
    async append(run: PolicyRun): Promise<AppendPolicyRunResult> {
      try {
        const inserted = await dependencies.pool.query(
          `INSERT INTO storyrail.policy_runs
             (policy_run_id, story_id, source_id, policy, status, step, observed_at, payload)
           SELECT $1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb
           WHERE ($2::text IS NOT NULL AND EXISTS (
                    SELECT 1 FROM storyrail.stories WHERE story_id = $2 AND site_id = $9
                  ))
              OR ($3::text IS NOT NULL AND EXISTS (
                    SELECT 1 FROM storyrail.url_sources WHERE source_id = $3 AND site_id = $9
                  ))`,
          [
            run.id,
            run.storyId,
            run.sourceId,
            run.policy,
            run.status,
            run.step,
            run.observedAt,
            JSON.stringify(run),
            dependencies.siteId,
          ],
        );
        if (inserted.rowCount === 0)
          return {
            ok: false,
            error: {
              code: "POLICY_RUN_ROOT_UNAVAILABLE",
              message: "The policy root is not available in this newsroom.",
            },
          };
        return { ok: true, run };
      } catch (caught) {
        const constraint = (caught as { readonly constraint?: string }).constraint;
        if (constraint === "policy_runs_one_in_flight_per_story")
          return {
            ok: false,
            error: {
              code: "POLICY_ALREADY_RUNNING",
              message: "This Story is already under an automated policy.",
            },
          };
        if (constraint === "policy_runs_one_in_flight_per_source")
          return {
            ok: false,
            error: {
              code: "POLICY_ALREADY_RUNNING",
              message: "This Source is already under an automated policy.",
            },
          };
        if (constraint === "policy_runs_pkey")
          return {
            ok: false,
            error: {
              code: "POLICY_RUN_ID_CONFLICT",
              message: "A policy run with this identity already exists.",
            },
          };
        throw caught;
      }
    },

    async observe(command): Promise<UpdatePolicyRunResult> {
      // The Story is only ever written where the column is still empty. A run that already names
      // one keeps it, so the coalesce here and the trigger in the database agree rather than
      // leaving the database to refuse something this adapter had already decided to do.
      const { rowCount } = await dependencies.pool.query(
        `UPDATE storyrail.policy_runs
         SET step = $2,
             observed_at = $3::timestamptz,
             story_id = COALESCE(story_id, $4),
             source_id = CASE WHEN story_id IS NULL AND $4::text IS NOT NULL THEN NULL ELSE source_id END,
             payload = payload || jsonb_build_object(
               'step', $2::text,
               'observedAt', $3::text,
               'storyId', COALESCE(story_id, $4::text),
               'sourceId', CASE WHEN story_id IS NULL AND $4::text IS NOT NULL THEN NULL ELSE source_id END
             )
         WHERE policy_run_id = $1 AND status = 'running'
           AND (
             (policy_runs.story_id IS NOT NULL
              AND ($4::text IS NULL OR $4 = policy_runs.story_id)
              AND EXISTS (
                SELECT 1 FROM storyrail.stories
                WHERE story_id = policy_runs.story_id AND site_id = $5
              ))
             OR (policy_runs.story_id IS NULL
                 AND EXISTS (
                   SELECT 1 FROM storyrail.url_sources
                   WHERE source_id = policy_runs.source_id AND site_id = $5
                 )
                 AND (
                   ($4::text IS NULL)
                   OR EXISTS (
                     SELECT 1 FROM storyrail.stories WHERE story_id = $4 AND site_id = $5
                   )
                 ))
           )`,
        [
          command.id,
          command.step,
          command.observedAt,
          command.storyId ?? null,
          dependencies.siteId,
        ],
      );
      return rowCount === 0
        ? {
            ok: false,
            error: {
              code: "POLICY_RUN_NOT_RUNNING",
              message: "The policy run is not in flight.",
            },
          }
        : { ok: true, run: await readOne(command.id) };
    },

    async settle(command): Promise<UpdatePolicyRunResult> {
      const { rowCount } = await dependencies.pool.query(
        `UPDATE storyrail.policy_runs
         SET status = 'settled',
             payload = payload || jsonb_build_object(
               'status', 'settled',
               'conclusion', $2::text,
               'reason', $3::text,
               'completedAt', $4::text
             )
         WHERE policy_run_id = $1 AND status = 'running'
           AND EXISTS (
             SELECT 1 FROM storyrail.stories WHERE story_id = policy_runs.story_id AND site_id = $5
             UNION ALL
             SELECT 1 FROM storyrail.url_sources WHERE source_id = policy_runs.source_id AND site_id = $5
           )`,
        [command.id, command.conclusion, command.reason, command.completedAt, dependencies.siteId],
      );
      return rowCount === 0
        ? {
            ok: false,
            error: {
              code: "POLICY_RUN_NOT_RUNNING",
              message: "The policy run is already settled.",
            },
          }
        : { ok: true, run: await readOne(command.id) };
    },

    async findById(id: PolicyRunId): Promise<PolicyRun | null> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT run.payload FROM storyrail.policy_runs AS run
         LEFT JOIN storyrail.stories AS story ON story.story_id = run.story_id
         LEFT JOIN storyrail.url_sources AS source ON source.source_id = run.source_id
         WHERE run.policy_run_id = $1 AND COALESCE(story.site_id, source.site_id) = $2`,
        [id, dependencies.siteId],
      );
      return rows[0] === undefined ? null : decode(rows[0].payload);
    },

    async findByStoryId(storyId: StoryId): Promise<readonly PolicyRun[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT run.payload FROM storyrail.policy_runs AS run
         JOIN storyrail.stories AS story ON story.story_id = run.story_id
         WHERE run.story_id = $1 AND story.site_id = $2 ORDER BY run.append_position`,
        [storyId, dependencies.siteId],
      );
      return rows.map((row) => decode(row.payload));
    },

    // Reconciliation sweeps rather than following an identifier the caller already proved it may
    // see, so it reaches the Site through the run's active Story or Source root. Left unscoped it
    // would let one newsroom's housekeeping settle another newsroom's abandoned work.
    async listStaleRunning(before: string): Promise<readonly PolicyRun[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT run.payload FROM storyrail.policy_runs AS run
         LEFT JOIN storyrail.stories AS story ON story.story_id = run.story_id
         LEFT JOIN storyrail.url_sources AS source ON source.source_id = run.source_id
         WHERE run.status = 'running'
           AND run.observed_at < $1::timestamptz
           AND COALESCE(story.site_id, source.site_id) = $2
         ORDER BY run.append_position`,
        [before, dependencies.siteId],
      );
      return rows.map((row) => decode(row.payload));
    },
  };
}
