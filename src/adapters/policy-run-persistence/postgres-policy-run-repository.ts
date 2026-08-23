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
  storyId: nonEmpty,
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
}): PolicyRunRepository {
  const readOne = async (id: PolicyRunId): Promise<PolicyRun> => {
    const { rows } = await dependencies.pool.query<{ payload: unknown }>(
      "SELECT payload FROM storyrail.policy_runs WHERE policy_run_id = $1",
      [id],
    );
    if (rows[0] === undefined) throw new PostgresPolicyRunInvariantError();
    return decode(rows[0].payload);
  };

  return {
    async append(run: PolicyRun): Promise<AppendPolicyRunResult> {
      try {
        await dependencies.pool.query(
          `INSERT INTO storyrail.policy_runs
             (policy_run_id, story_id, policy, status, step, observed_at, payload)
           VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)`,
          [
            run.id,
            run.storyId,
            run.policy,
            run.status,
            run.step,
            run.observedAt,
            JSON.stringify(run),
          ],
        );
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
      const { rowCount } = await dependencies.pool.query(
        `UPDATE storyrail.policy_runs
         SET step = $2,
             observed_at = $3::timestamptz,
             payload = payload || jsonb_build_object('step', $2::text, 'observedAt', $3::text)
         WHERE policy_run_id = $1 AND status = 'running'`,
        [command.id, command.step, command.observedAt],
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
         WHERE policy_run_id = $1 AND status = 'running'`,
        [command.id, command.conclusion, command.reason, command.completedAt],
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

    async findByStoryId(storyId: StoryId): Promise<readonly PolicyRun[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        "SELECT payload FROM storyrail.policy_runs WHERE story_id = $1 ORDER BY append_position",
        [storyId],
      );
      return rows.map((row) => decode(row.payload));
    },

    async listStaleRunning(before: string): Promise<readonly PolicyRun[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT payload FROM storyrail.policy_runs
         WHERE status = 'running' AND observed_at < $1::timestamptz
         ORDER BY append_position`,
        [before],
      );
      return rows.map((row) => decode(row.payload));
    },
  };
}
