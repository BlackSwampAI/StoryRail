import { isDeepStrictEqual } from "node:util";

import { agentRunSchema, recordAgentRun, type AgentRun } from "@/domain/editorial";

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
    !(
      (row.role === "assignment_editor" && row.operation === "assignment_proposal") ||
      (row.role === "researcher" && row.operation === "source_research") ||
      (row.role === "writer" &&
        (row.operation === "article_draft" || row.operation === "article_revision")) ||
      (row.role === "editor_in_chief" && row.operation === "article_review")
    ) ||
    (row.outcome !== "running" && row.outcome !== "succeeded" && row.outcome !== "failed") ||
    !record(payload) ||
    !exact(payload, [
      ...common,
      ...(row.outcome === "running"
        ? []
        : [
            row.outcome === "failed"
              ? "failure"
              : row.role === "writer"
                ? "articleId"
                : row.role === "editor_in_chief"
                  ? "review"
                  : row.role === "researcher"
                    ? "attached"
                    : "proposal",
          ]),
      ...(row.outcome === "succeeded" && row.role === "writer" ? ["revisionId"] : []),
      // Present only where the Writer had to be told which citations were wrong.
      ...(row.outcome === "succeeded" && row.role === "writer" && "corrected" in payload
        ? ["corrected"]
        : []),
    ]) ||
    payload.id !== row.run_id ||
    payload.storyId !== row.story_id ||
    payload.profileId !== row.profile_id ||
    payload.role !== row.role ||
    payload.operation !== row.operation ||
    payload.outcome !== row.outcome
  ) {
    throw new PostgresAgentRunInvariantError();
  }
  const parsed = agentRunSchema.safeParse(payload);
  if (!parsed.success) throw new PostgresAgentRunInvariantError();
  const recorded = recordAgentRun(parsed.data as unknown as AgentRun);
  if (!recorded.ok) throw new PostgresAgentRunInvariantError();
  return recorded.run;
}
