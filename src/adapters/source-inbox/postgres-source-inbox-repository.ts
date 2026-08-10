import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { SourceInboxItem, SourceInboxRepository } from "@/application/source-inbox";
import {
  AGENT_ROLES,
  type AgentRole,
  type AgentRunId,
  type CanonicalSourceUrl,
  type EditorialActor,
  type OperatorId,
  type SourceExtraction,
  type SourceId,
  type UrlSource,
} from "@/domain/editorial";
import { decodePostgresSourceExtraction } from "@/adapters/source-persistence/postgres-source-extraction-decoder";

interface SourceInboxRow extends QueryResultRow {
  readonly source_id: unknown;
  readonly canonical_url: unknown;
  readonly source_payload: unknown;
  readonly extraction_id: unknown;
  readonly extraction_source_id: unknown;
  readonly extraction_outcome: unknown;
  readonly extraction_payload: unknown;
  readonly append_position: unknown;
}

class PostgresSourceInboxInvariantError extends Error {
  constructor() {
    super("PostgreSQL Source Inbox returned an invalid or impossible persisted result.");
    this.name = "PostgresSourceInboxInvariantError";
  }
}

function invariantError(): PostgresSourceInboxInvariantError {
  return new PostgresSourceInboxInvariantError();
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

function decodeActor(value: unknown): EditorialActor {
  if (!isRecord(value)) throw invariantError();
  if (
    value.type === "operator" &&
    hasExactKeys(value, ["type", "operatorId"]) &&
    typeof value.operatorId === "string"
  ) {
    return { type: "operator", operatorId: value.operatorId as OperatorId };
  }
  if (
    value.type === "agent" &&
    hasExactKeys(value, ["type", "role", "runId"]) &&
    isAgentRole(value.role) &&
    typeof value.runId === "string"
  ) {
    return {
      type: "agent",
      role: value.role,
      runId: value.runId as AgentRunId,
    };
  }
  throw invariantError();
}

function decodeSource(row: SourceInboxRow): UrlSource {
  const payload = row.source_payload;
  if (
    typeof row.source_id !== "string" ||
    typeof row.canonical_url !== "string" ||
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      "id",
      "type",
      "submittedUrl",
      "canonicalUrl",
      "submittedBy",
      "receivedAt",
    ]) ||
    payload.id !== row.source_id ||
    payload.type !== "url" ||
    typeof payload.submittedUrl !== "string" ||
    payload.canonicalUrl !== row.canonical_url ||
    typeof payload.receivedAt !== "string"
  ) {
    throw invariantError();
  }
  return {
    id: row.source_id as SourceId,
    type: "url",
    submittedUrl: payload.submittedUrl,
    canonicalUrl: row.canonical_url as CanonicalSourceUrl,
    submittedBy: decodeActor(payload.submittedBy),
    receivedAt: payload.receivedAt,
  };
}

function hasNoExtraction(row: SourceInboxRow): boolean {
  return (
    row.extraction_id === null &&
    row.extraction_source_id === null &&
    row.extraction_outcome === null &&
    row.extraction_payload === null &&
    row.append_position === null
  );
}

function decodeExtraction(row: SourceInboxRow, sourceId: SourceId): SourceExtraction {
  if (
    typeof row.extraction_id !== "string" ||
    row.extraction_source_id !== sourceId ||
    (row.extraction_outcome !== "succeeded" && row.extraction_outcome !== "failed") ||
    (typeof row.append_position !== "string" && typeof row.append_position !== "number")
  ) {
    throw invariantError();
  }
  const extraction = decodePostgresSourceExtraction(row.extraction_payload, invariantError);
  if (
    extraction.id !== row.extraction_id ||
    extraction.sourceId !== sourceId ||
    extraction.outcome !== row.extraction_outcome
  ) {
    throw invariantError();
  }
  return extraction;
}

export function createPostgresSourceInboxRepository(options: {
  readonly pool: Pool;
}): SourceInboxRepository {
  return {
    async listPending() {
      const result = await options.pool.query<SourceInboxRow>(
        `SELECT source.source_id,
                source.canonical_url,
                source.payload AS source_payload,
                extraction.extraction_id,
                extraction.source_id AS extraction_source_id,
                extraction.outcome AS extraction_outcome,
                extraction.payload AS extraction_payload,
                extraction.append_position
         FROM storyrail.url_sources AS source
         LEFT JOIN storyrail.source_extractions AS extraction
           ON extraction.source_id = source.source_id
         WHERE NOT EXISTS (
           SELECT 1 FROM storyrail.story_source_attachments AS attachment
           WHERE attachment.source_id = source.source_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM storyrail.source_triage_decisions AS triage
           WHERE triage.source_id = source.source_id
         )
         ORDER BY source.source_id COLLATE "C" ASC,
                  extraction.append_position ASC`,
      );

      const items: { source: UrlSource; extractions: SourceExtraction[] }[] = [];
      for (const row of result.rows) {
        const source = decodeSource(row);
        const previous = items.at(-1);
        if (previous?.source.id === source.id) {
          if (!isDeepStrictEqual(previous.source, source) || hasNoExtraction(row)) {
            throw invariantError();
          }
          previous.extractions.push(decodeExtraction(row, source.id));
          continue;
        }
        items.push({
          source,
          extractions: hasNoExtraction(row) ? [] : [decodeExtraction(row, source.id)],
        });
      }
      return items satisfies readonly SourceInboxItem[];
    },
  };
}
