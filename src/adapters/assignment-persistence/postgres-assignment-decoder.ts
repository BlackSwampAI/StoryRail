import { isDeepStrictEqual } from "node:util";

import {
  AGENT_ROLES,
  STORY_STATES,
  assignmentSchema,
  type AgentRole,
  type AgentRunId,
  type Assignment,
  type EditorialActor,
  type OperatorId,
  type StoryId,
  type StoryState,
  type StoryTransitionReceipt,
} from "@/domain/editorial";

export class PostgresAssignmentInvariantError extends Error {
  constructor() {
    super("PostgreSQL Assignment persistence returned an invalid or impossible result.");
    this.name = "PostgresAssignmentInvariantError";
  }
}

function fail(): never {
  throw new PostgresAssignmentInvariantError();
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function state(value: unknown): value is StoryState {
  return typeof value === "string" && (STORY_STATES as readonly string[]).includes(value);
}

function role(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

export function decodeAssignmentActor(value: unknown): EditorialActor {
  if (!record(value)) return fail();
  if (
    value.type === "operator" &&
    exact(value, ["type", "operatorId"]) &&
    typeof value.operatorId === "string" &&
    value.operatorId.length > 0
  ) {
    return { type: "operator", operatorId: value.operatorId as OperatorId };
  }
  if (
    value.type === "agent" &&
    exact(value, ["type", "role", "runId"]) &&
    role(value.role) &&
    typeof value.runId === "string" &&
    value.runId.length > 0
  ) {
    return { type: "agent", role: value.role, runId: value.runId as AgentRunId };
  }
  return fail();
}

export function decodePostgresAssignment(row: {
  readonly assignment_id: unknown;
  readonly story_id: unknown;
  readonly writer_profile_id: unknown;
  readonly writer_role?: unknown;
  readonly payload: unknown;
}): Assignment {
  const parsed = assignmentSchema.safeParse(row.payload);
  if (
    typeof row.assignment_id !== "string" ||
    typeof row.story_id !== "string" ||
    typeof row.writer_profile_id !== "string" ||
    (row.writer_role !== undefined && row.writer_role !== "writer") ||
    !parsed.success ||
    parsed.data.id !== row.assignment_id ||
    parsed.data.storyId !== row.story_id ||
    parsed.data.writerProfileId !== row.writer_profile_id
  )
    return fail();
  return structuredClone(parsed.data) as unknown as Assignment;
}

export function decodePostgresTransitionReceipt(row: {
  readonly transition_id: unknown;
  readonly story_id: unknown;
  readonly previous_state: unknown;
  readonly next_state: unknown;
  readonly revision_cycle: unknown;
  readonly payload: unknown;
}): StoryTransitionReceipt {
  const value = row.payload;
  if (
    typeof row.transition_id !== "string" ||
    typeof row.story_id !== "string" ||
    !state(row.previous_state) ||
    !state(row.next_state) ||
    !Number.isInteger(row.revision_cycle) ||
    !record(value) ||
    !exact(value, [
      "transitionId",
      "storyId",
      "previousState",
      "nextState",
      "actor",
      "reason",
      "occurredAt",
      "revisionCycle",
    ]) ||
    value.transitionId !== row.transition_id ||
    value.storyId !== row.story_id ||
    value.previousState !== row.previous_state ||
    value.nextState !== row.next_state ||
    value.revisionCycle !== row.revision_cycle ||
    typeof value.reason !== "string" ||
    value.reason.trim().length === 0 ||
    value.reason !== value.reason.trim() ||
    typeof value.occurredAt !== "string"
  )
    return fail();
  return {
    transitionId: value.transitionId as StoryTransitionReceipt["transitionId"],
    storyId: value.storyId as StoryId,
    previousState: row.previous_state,
    nextState: row.next_state,
    actor: decodeAssignmentActor(value.actor),
    reason: value.reason,
    occurredAt: value.occurredAt,
    revisionCycle: row.revision_cycle as number,
  };
}
