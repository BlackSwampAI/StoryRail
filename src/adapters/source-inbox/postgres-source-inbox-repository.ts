import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import { decodePostgresSourceEvidencePreparation } from "@/adapters/source-evidence-preparation-persistence";
import { decodePostgresSourceExtraction } from "@/adapters/source-persistence/postgres-source-extraction-decoder";
import type { SourceInboxItem, SourceInboxRepository } from "@/application/source-inbox";
import {
  AGENT_ROLES,
  type AgentRole,
  type AgentRunId,
  type CanonicalSourceUrl,
  type EditorialActor,
  type OperatorId,
  type SiteId,
  type SourceEvidencePreparation,
  type SourceExtraction,
  type SourceId,
  type UrlSource,
} from "@/domain/editorial";

interface SourceInboxRow extends QueryResultRow {
  readonly source_id: unknown;
  readonly canonical_url: unknown;
  readonly source_payload: unknown;
  readonly extraction_payloads: unknown;
  readonly preparation_payloads: unknown;
}

class PostgresSourceInboxInvariantError extends Error {
  constructor() {
    super("PostgreSQL Source Inbox returned an invalid or impossible persisted result.");
    this.name = "PostgresSourceInboxInvariantError";
  }
}

const invariantError = () => new PostgresSourceInboxInvariantError();
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: readonly string[]) =>
  isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());

function actor(value: unknown): EditorialActor {
  if (!isRecord(value)) throw invariantError();
  if (
    value.type === "operator" &&
    exact(value, ["type", "operatorId"]) &&
    typeof value.operatorId === "string"
  ) {
    return { type: "operator", operatorId: value.operatorId as OperatorId };
  }
  if (
    value.type === "agent" &&
    exact(value, ["type", "role", "runId"]) &&
    typeof value.role === "string" &&
    (AGENT_ROLES as readonly string[]).includes(value.role) &&
    typeof value.runId === "string"
  ) {
    return {
      type: "agent",
      role: value.role as AgentRole,
      runId: value.runId as AgentRunId,
    };
  }
  throw invariantError();
}

function source(row: SourceInboxRow): UrlSource {
  const payload = row.source_payload;
  if (
    typeof row.source_id !== "string" ||
    typeof row.canonical_url !== "string" ||
    !isRecord(payload) ||
    !exact(payload, ["id", "type", "submittedUrl", "canonicalUrl", "submittedBy", "receivedAt"]) ||
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
    submittedBy: actor(payload.submittedBy),
    receivedAt: payload.receivedAt,
  };
}

function extractions(value: unknown, sourceId: SourceId): SourceExtraction[] {
  if (!Array.isArray(value)) throw invariantError();
  return value.map((payload) => {
    const extraction = decodePostgresSourceExtraction(payload, invariantError);
    if (extraction.sourceId !== sourceId) throw invariantError();
    return extraction;
  });
}

function preparations(value: unknown, sourceId: SourceId): SourceEvidencePreparation[] {
  if (!Array.isArray(value)) throw invariantError();
  return value.map((payload) => {
    const preparation = decodePostgresSourceEvidencePreparation(payload, invariantError);
    if (preparation.sourceId !== sourceId) throw invariantError();
    return preparation;
  });
}

export function createPostgresSourceInboxRepository(options: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): SourceInboxRepository {
  return {
    async listPending() {
      const result = await options.pool.query<SourceInboxRow>(
        `SELECT source.source_id,
                source.canonical_url,
                source.payload AS source_payload,
                COALESCE((
                  SELECT jsonb_agg(extraction.payload ORDER BY extraction.append_position ASC)
                  FROM storyrail.source_extractions AS extraction
                  WHERE extraction.source_id = source.source_id
                ), '[]'::jsonb) AS extraction_payloads,
                COALESCE((
                  SELECT jsonb_agg(preparation.payload ORDER BY preparation.append_position ASC)
                  FROM storyrail.source_evidence_preparations AS preparation
                  WHERE preparation.source_id = source.source_id
                ), '[]'::jsonb) AS preparation_payloads
         FROM storyrail.url_sources AS source
         WHERE source.site_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM storyrail.story_source_attachments AS attachment
           WHERE attachment.source_id = source.source_id
         )
         AND NOT EXISTS (
           SELECT 1 FROM storyrail.source_triage_decisions AS triage
           WHERE triage.source_id = source.source_id
         )
         ORDER BY source.source_id COLLATE "C" ASC`,
        [options.siteId],
      );
      return result.rows.map((row) => {
        const durableSource = source(row);
        return {
          source: durableSource,
          extractions: extractions(row.extraction_payloads, durableSource.id),
          preparations: preparations(row.preparation_payloads, durableSource.id),
        } satisfies SourceInboxItem;
      });
    },
  };
}
