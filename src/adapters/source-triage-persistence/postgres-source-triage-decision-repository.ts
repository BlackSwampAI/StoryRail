import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  RecordSourceTriageDecisionResult,
  SourceTriageDecisionRepository,
} from "@/application/source-triage";
import {
  AGENT_ROLES,
  SOURCE_TRIAGE_DECISION_KINDS,
  type AgentRole,
  type AgentRunId,
  type EditorialActor,
  type OperatorId,
  type SiteId,
  type SourceId,
  type SourceTriageDecision,
  type SourceTriageDecisionKind,
  type StoryId,
} from "@/domain/editorial";

interface TriageRow extends QueryResultRow {
  readonly source_id: unknown;
  readonly decision: unknown;
  readonly story_id: unknown;
  readonly payload: unknown;
}

interface ExistsRow extends QueryResultRow {
  readonly exists: unknown;
}

class PostgresSourceTriageInvariantError extends Error {
  constructor() {
    super("PostgreSQL Source triage returned an invalid or impossible persisted result.");
    this.name = "PostgresSourceTriageInvariantError";
  }
}

function invariantError(): PostgresSourceTriageInvariantError {
  return new PostgresSourceTriageInvariantError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

function isDecision(value: unknown): value is SourceTriageDecisionKind {
  return (
    typeof value === "string" && (SOURCE_TRIAGE_DECISION_KINDS as readonly string[]).includes(value)
  );
}

function decodeActor(value: unknown): EditorialActor {
  if (!isRecord(value)) throw invariantError();
  if (
    value.type === "operator" &&
    hasExactKeys(value, ["type", "operatorId"]) &&
    typeof value.operatorId === "string"
  )
    return { type: "operator", operatorId: value.operatorId as OperatorId };
  if (
    value.type === "agent" &&
    hasExactKeys(value, ["type", "role", "runId"]) &&
    isAgentRole(value.role) &&
    typeof value.runId === "string"
  )
    return {
      type: "agent",
      role: value.role,
      runId: value.runId as AgentRunId,
    };
  throw invariantError();
}

function decodeDecision(row: TriageRow): SourceTriageDecision {
  const payload = row.payload;
  if (
    typeof row.source_id !== "string" ||
    !isDecision(row.decision) ||
    (row.story_id !== null && typeof row.story_id !== "string") ||
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      "sourceId",
      "decision",
      "storyId",
      "reason",
      "decidedBy",
      "decidedAt",
    ]) ||
    payload.sourceId !== row.source_id ||
    payload.decision !== row.decision ||
    payload.storyId !== row.story_id ||
    typeof payload.reason !== "string" ||
    payload.reason.length === 0 ||
    payload.reason !== payload.reason.trim() ||
    typeof payload.decidedAt !== "string" ||
    (row.decision === "skip" ? row.story_id !== null : typeof row.story_id !== "string")
  )
    throw invariantError();
  return {
    sourceId: row.source_id as SourceId,
    decision: row.decision,
    storyId: row.story_id as StoryId | null,
    reason: payload.reason,
    decidedBy: decodeActor(payload.decidedBy),
    decidedAt: payload.decidedAt,
  };
}

function semanticallyEqual(left: SourceTriageDecision, right: SourceTriageDecision): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.decision === right.decision &&
    left.storyId === right.storyId &&
    left.reason === right.reason &&
    isDeepStrictEqual(left.decidedBy, right.decidedBy)
  );
}

async function exists(pool: Pool, sql: string, parameters: readonly unknown[]): Promise<boolean> {
  const result = await pool.query<ExistsRow>(sql, [...parameters]);
  if (typeof result.rows[0]?.exists !== "boolean") throw invariantError();
  return result.rows[0].exists;
}

export function createPostgresSourceTriageDecisionRepository(options: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): SourceTriageDecisionRepository {
  const findBySourceId = async (sourceIdentity: SourceId) => {
    const result = await options.pool.query<TriageRow>(
      `SELECT triage.source_id, triage.decision, triage.story_id, triage.payload
       FROM storyrail.source_triage_decisions AS triage
       JOIN storyrail.url_sources AS source ON source.source_id = triage.source_id
       WHERE triage.source_id = $1
         AND source.site_id = $2`,
      [sourceIdentity, options.siteId],
    );
    return result.rows[0] ? decodeDecision(result.rows[0]) : null;
  };

  return {
    findBySourceId,
    async record(decision): Promise<RecordSourceTriageDecisionResult> {
      const payload = JSON.stringify(decision);
      const inserted = await options.pool.query<TriageRow>(
        `INSERT INTO storyrail.source_triage_decisions (source_id, decision, story_id, payload)
         SELECT $1, $2, $3, $4::jsonb
         FROM storyrail.url_sources AS source
         WHERE source.source_id = $1
           AND source.site_id = $5
           AND (
             ($2 = 'skip' AND NOT EXISTS (
               SELECT 1 FROM storyrail.story_source_attachments
               WHERE source_id = $1
             ))
             OR
             ($2 IN ('new_story', 'existing_story') AND EXISTS (
               SELECT 1 FROM storyrail.story_source_attachments
               WHERE story_id = $3 AND source_id = $1
             ))
           )
         ON CONFLICT DO NOTHING
         RETURNING source_id, decision, story_id, payload`,
        [decision.sourceId, decision.decision, decision.storyId, payload, options.siteId],
      );
      if (inserted.rows[0]) {
        return { ok: true, triageDecision: decodeDecision(inserted.rows[0]) };
      }

      const existing = await findBySourceId(decision.sourceId);
      if (existing) {
        return semanticallyEqual(existing, decision)
          ? { ok: true, triageDecision: existing }
          : {
              ok: false,
              error: {
                code: "SOURCE_TRIAGE_CONFLICT",
                message: "A different final triage decision already exists for this Source.",
                sourceId: decision.sourceId,
              },
            };
      }

      const sourceExists = await exists(
        options.pool,
        `SELECT EXISTS (
           SELECT 1 FROM storyrail.url_sources WHERE source_id = $1 AND site_id = $2
         ) AS exists`,
        [decision.sourceId, options.siteId],
      );
      if (!sourceExists) {
        return {
          ok: false,
          error: {
            code: "SOURCE_NOT_FOUND",
            message: "The Source to triage does not exist.",
            sourceId: decision.sourceId,
          },
        };
      }

      if (decision.decision === "skip") {
        return {
          ok: false,
          error: {
            code: "SOURCE_ALREADY_ATTACHED",
            message: "A Source already attached to a Story cannot be skipped.",
            sourceId: decision.sourceId,
          },
        };
      }

      return {
        ok: false,
        error: {
          code: "STORY_SOURCE_ATTACHMENT_NOT_FOUND",
          message: "The Source must be attached to the selected Story before triage.",
          sourceId: decision.sourceId,
          storyId: decision.storyId as StoryId,
        },
      };
    },
  };
}
