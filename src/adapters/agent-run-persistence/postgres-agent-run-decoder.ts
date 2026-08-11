import { isDeepStrictEqual } from "node:util";

import { z } from "zod";

import {
  AGENT_ROLES,
  MODEL_FAILURE_CODES,
  STORY_STATES,
  recordAgentRun,
  type AgentRun,
} from "@/domain/editorial";

export class PostgresAgentRunInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted AgentRun.");
    this.name = "PostgresAgentRunInvariantError";
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0 && value === value.trim());
const actor = z.discriminatedUnion("type", [
  z.object({ type: z.literal("operator"), operatorId: nonEmpty }).strict(),
  z.object({ type: z.literal("agent"), role: z.enum(AGENT_ROLES), runId: nonEmpty }).strict(),
]);
const descriptor = z.object({ provider: nonEmpty, model: nonEmpty }).strict();
const prompt = z.object({ key: nonEmpty, version: nonEmpty }).strict();
const input = z
  .object({
    story: z
      .object({
        id: nonEmpty,
        title: nonEmpty,
        state: z.enum(STORY_STATES),
        revisionCycle: z.number().int().min(0).max(2),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            sourceId: nonEmpty,
            relevance: nonEmpty,
            evidenceKind: z.enum(["prepared", "raw"]),
            evidenceId: nonEmpty,
          })
          .strict(),
      )
      .min(1),
    unavailableSourceIds: z.array(nonEmpty),
    writerProfileIds: z.array(nonEmpty).min(1),
  })
  .strict();
const common = {
  id: nonEmpty,
  storyId: nonEmpty,
  profileId: nonEmpty,
  role: z.literal("assignment_editor"),
  operation: z.literal("assignment_proposal"),
  model: descriptor,
  prompt,
  requestedBy: actor,
  startedAt: nonEmpty,
  completedAt: nonEmpty,
  input,
};
const schema = z.discriminatedUnion("outcome", [
  z
    .object({
      ...common,
      outcome: z.literal("succeeded"),
      proposal: z
        .object({
          writerProfileId: nonEmpty,
          angle: nonEmpty,
          brief: nonEmpty,
          constraints: nonEmpty.nullable(),
          reason: nonEmpty,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...common,
      outcome: z.literal("failed"),
      failure: z.object({ code: z.enum(MODEL_FAILURE_CODES), retryable: z.boolean() }).strict(),
    })
    .strict(),
]);

export function decodePostgresAgentRun(row: {
  readonly run_id: unknown;
  readonly story_id: unknown;
  readonly profile_id: unknown;
  readonly role: unknown;
  readonly operation: unknown;
  readonly outcome: unknown;
  readonly payload: unknown;
}): AgentRun {
  const payload = row.payload;
  const common = [
    "id",
    "storyId",
    "profileId",
    "role",
    "operation",
    "model",
    "prompt",
    "requestedBy",
    "startedAt",
    "completedAt",
    "input",
    "outcome",
  ];
  if (
    typeof row.run_id !== "string" ||
    typeof row.story_id !== "string" ||
    typeof row.profile_id !== "string" ||
    row.role !== "assignment_editor" ||
    row.operation !== "assignment_proposal" ||
    (row.outcome !== "succeeded" && row.outcome !== "failed") ||
    !record(payload) ||
    !exact(payload, [...common, row.outcome === "succeeded" ? "proposal" : "failure"]) ||
    payload.id !== row.run_id ||
    payload.storyId !== row.story_id ||
    payload.profileId !== row.profile_id ||
    payload.role !== row.role ||
    payload.operation !== row.operation ||
    payload.outcome !== row.outcome
  ) {
    throw new PostgresAgentRunInvariantError();
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new PostgresAgentRunInvariantError();
  const recorded = recordAgentRun(parsed.data as unknown as AgentRun);
  if (!recorded.ok) throw new PostgresAgentRunInvariantError();
  return recorded.run;
}
