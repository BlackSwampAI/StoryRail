import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentRole,
  CanonicalSourceUrl,
  EditorialActor,
  SiteId,
  SourceExtraction,
  SourceExtractionId,
  SourceId,
  UrlSource,
} from "@/domain/editorial";
import { AGENT_ROLES } from "@/domain/editorial";
import type {
  AppendSourceExtractionResult,
  PersistUrlSourceResult,
  SourceExtractionRepository,
  UrlSourceRepository,
} from "@/application/source-persistence";

import { decodePostgresSourceExtraction } from "./postgres-source-extraction-decoder";

export interface PostgresSourceRepositories {
  readonly sources: UrlSourceRepository;
  readonly extractions: SourceExtractionRepository;
}

export interface CreatePostgresSourceRepositoriesOptions {
  readonly pool: Pool;
  readonly siteId: SiteId;
}

interface PayloadRow extends QueryResultRow {
  readonly payload: unknown;
}

class PostgresSourcePersistenceInvariantError extends Error {
  constructor() {
    super("PostgreSQL Source persistence returned an invalid or impossible result.");
    this.name = "PostgresSourcePersistenceInvariantError";
  }
}

function invariantError(): PostgresSourcePersistenceInvariantError {
  return new PostgresSourcePersistenceInvariantError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return isDeepStrictEqual(actualKeys, expectedKeys);
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "operator") {
    return hasExactKeys(value, ["type", "operatorId"]) && typeof value.operatorId === "string";
  }

  return (
    value.type === "agent" &&
    hasExactKeys(value, ["type", "role", "runId"]) &&
    isAgentRole(value.role) &&
    typeof value.runId === "string"
  );
}

function decodeUrlSource(payload: unknown): UrlSource {
  if (
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      "id",
      "type",
      "submittedUrl",
      "canonicalUrl",
      "submittedBy",
      "receivedAt",
    ]) ||
    typeof payload.id !== "string" ||
    payload.type !== "url" ||
    typeof payload.submittedUrl !== "string" ||
    typeof payload.canonicalUrl !== "string" ||
    !isActor(payload.submittedBy) ||
    typeof payload.receivedAt !== "string"
  ) {
    throw invariantError();
  }

  return structuredClone(payload) as unknown as UrlSource;
}

function serialize(value: UrlSource | SourceExtraction): string {
  const serialized = JSON.stringify(value);

  if (serialized === undefined) {
    throw invariantError();
  }

  return serialized;
}

async function findSourceById(
  pool: Pool,
  siteId: SiteId,
  sourceIdentity: SourceId,
): Promise<UrlSource | null> {
  const result = await pool.query<PayloadRow>(
    `SELECT payload
     FROM storyrail.url_sources
     WHERE source_id = $1
       AND site_id = $2`,
    [sourceIdentity, siteId],
  );
  const row = result.rows[0];
  return row ? decodeUrlSource(row.payload) : null;
}

async function findExtractionById(
  pool: Pool,
  siteId: SiteId,
  extractionIdentity: SourceExtractionId,
): Promise<SourceExtraction | null> {
  const result = await pool.query<PayloadRow>(
    `SELECT extraction.payload
     FROM storyrail.source_extractions AS extraction
     JOIN storyrail.url_sources AS source ON source.source_id = extraction.source_id
     WHERE extraction.extraction_id = $1
       AND source.site_id = $2`,
    [extractionIdentity, siteId],
  );
  const row = result.rows[0];
  return row ? decodePostgresSourceExtraction(row.payload, invariantError) : null;
}

export function createPostgresSourceRepositories(
  options: CreatePostgresSourceRepositoriesOptions,
): PostgresSourceRepositories {
  const { pool, siteId } = options;

  const sources: UrlSourceRepository = {
    async persist({ source }): Promise<PersistUrlSourceResult> {
      const payload = serialize(source);
      const inserted = await pool.query<PayloadRow>(
        `INSERT INTO storyrail.url_sources (source_id, canonical_url, payload, site_id)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT DO NOTHING
         RETURNING payload`,
        [source.id, source.canonicalUrl, payload, siteId],
      );

      if (inserted.rows[0]) {
        return { ok: true, source: decodeUrlSource(inserted.rows[0].payload) };
      }

      const existingById = await findSourceById(pool, siteId, source.id);

      if (existingById) {
        if (isDeepStrictEqual(existingById, source)) {
          return { ok: true, source: structuredClone(existingById) };
        }

        return {
          ok: false,
          error: {
            code: "SOURCE_ID_CONFLICT",
            message: "A different Source with the same Source ID already exists.",
            sourceId: source.id,
          },
        };
      }

      const existingByCanonicalUrl = await sources.findByCanonicalUrl(source.canonicalUrl);

      if (existingByCanonicalUrl) {
        return {
          ok: false,
          error: {
            code: "DUPLICATE_SOURCE",
            message: "A Source with the same canonical URL already exists.",
            existingSourceId: existingByCanonicalUrl.id,
            canonicalUrl: source.canonicalUrl,
          },
        };
      }

      // A canonical URL is unique per Site, so the only collision left is the identifier, held
      // by a Source on another Site. That the other Site exists is not this Site's business; that
      // the identifier is already spoken for is.
      return {
        ok: false,
        error: {
          code: "SOURCE_ID_CONFLICT",
          message: "A different Source with the same Source ID already exists.",
          sourceId: source.id,
        },
      };
    },

    async findById(sourceIdentity) {
      return findSourceById(pool, siteId, sourceIdentity);
    },

    async findByCanonicalUrl(canonicalUrl: CanonicalSourceUrl) {
      const result = await pool.query<PayloadRow>(
        `SELECT payload
         FROM storyrail.url_sources
         WHERE canonical_url = $1
           AND site_id = $2`,
        [canonicalUrl, siteId],
      );
      const row = result.rows[0];
      return row ? decodeUrlSource(row.payload) : null;
    },
  };

  const extractions: SourceExtractionRepository = {
    async append({ extraction }): Promise<AppendSourceExtractionResult> {
      const payload = serialize(extraction);
      const inserted = await pool.query<PayloadRow>(
        `INSERT INTO storyrail.source_extractions (
           extraction_id,
           source_id,
           outcome,
           payload
         )
         SELECT $1, $2, $3, $4::jsonb
         FROM storyrail.url_sources
         WHERE source_id = $2
           AND site_id = $5
         ON CONFLICT DO NOTHING
         RETURNING payload`,
        [extraction.id, extraction.sourceId, extraction.outcome, payload, siteId],
      );

      if (inserted.rows[0]) {
        return {
          ok: true,
          extraction: decodePostgresSourceExtraction(inserted.rows[0].payload, invariantError),
        };
      }

      const existingById = await findExtractionById(pool, siteId, extraction.id);

      if (existingById) {
        if (isDeepStrictEqual(existingById, extraction)) {
          return { ok: true, extraction: structuredClone(existingById) };
        }

        return {
          ok: false,
          error: {
            code: "SOURCE_EXTRACTION_ID_CONFLICT",
            message: "A different Source extraction with the same extraction ID already exists.",
            extractionId: extraction.id,
          },
        };
      }

      const referencedSource = await findSourceById(pool, siteId, extraction.sourceId);

      if (!referencedSource) {
        return {
          ok: false,
          error: {
            code: "SOURCE_NOT_FOUND",
            message: "The Source referenced by the extraction does not exist.",
            sourceId: extraction.sourceId,
          },
        };
      }

      throw invariantError();
    },

    async listBySourceId(sourceIdentity) {
      const result = await pool.query<PayloadRow>(
        `SELECT extraction.payload
         FROM storyrail.source_extractions AS extraction
         JOIN storyrail.url_sources AS source ON source.source_id = extraction.source_id
         WHERE extraction.source_id = $1
           AND source.site_id = $2
         ORDER BY extraction.append_position ASC`,
        [sourceIdentity, siteId],
      );
      return result.rows.map((row) => decodePostgresSourceExtraction(row.payload, invariantError));
    },
  };

  return { sources, extractions };
}
