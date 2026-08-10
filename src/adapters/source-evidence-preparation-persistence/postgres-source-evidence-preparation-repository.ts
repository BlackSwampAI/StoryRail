import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AppendSourceEvidencePreparationResult,
  SourceEvidencePreparationRepository,
} from "@/application/source-evidence-preparation";
import type {
  SourceEvidencePreparation,
  SourceEvidencePreparationId,
  SourceExtractionId,
} from "@/domain/editorial";

import { decodePostgresSourceEvidencePreparation } from "./postgres-source-evidence-preparation-decoder";

interface PayloadRow extends QueryResultRow {
  readonly payload: unknown;
}

class PostgresSourceEvidencePreparationInvariantError extends Error {
  constructor() {
    super("PostgreSQL evidence preparation returned an invalid or impossible persisted result.");
    this.name = "PostgresSourceEvidencePreparationInvariantError";
  }
}

const invariantError = () => new PostgresSourceEvidencePreparationInvariantError();

async function findById(
  pool: Pool,
  preparationId: SourceEvidencePreparationId,
): Promise<SourceEvidencePreparation | null> {
  const result = await pool.query<PayloadRow>(
    `SELECT payload
     FROM storyrail.source_evidence_preparations
     WHERE preparation_id = $1`,
    [preparationId],
  );
  const row = result.rows[0];
  return row ? decodePostgresSourceEvidencePreparation(row.payload, invariantError) : null;
}

export function createPostgresSourceEvidencePreparationRepository(options: {
  readonly pool: Pool;
}): SourceEvidencePreparationRepository {
  return {
    async append(preparation): Promise<AppendSourceEvidencePreparationResult> {
      const payload = JSON.stringify(preparation);
      const inserted = await options.pool.query<PayloadRow>(
        `INSERT INTO storyrail.source_evidence_preparations (
           preparation_id, source_id, extraction_id, outcome, payload
         )
         SELECT $1, $2, $3, $4, $5::jsonb
         FROM storyrail.source_extractions
         WHERE extraction_id = $3 AND source_id = $2
         ON CONFLICT DO NOTHING
         RETURNING payload`,
        [
          preparation.id,
          preparation.sourceId,
          preparation.extractionId,
          preparation.outcome,
          payload,
        ],
      );
      if (inserted.rows[0]) {
        return {
          ok: true,
          preparation: decodePostgresSourceEvidencePreparation(
            inserted.rows[0].payload,
            invariantError,
          ),
        };
      }
      const existing = await findById(options.pool, preparation.id);
      if (existing) {
        return isDeepStrictEqual(existing, preparation)
          ? { ok: true, preparation: structuredClone(existing) }
          : {
              ok: false,
              error: {
                code: "SOURCE_EVIDENCE_PREPARATION_ID_CONFLICT",
                message: "A different evidence preparation with the same ID already exists.",
                preparationId: preparation.id,
              },
            };
      }
      const extraction = await options.pool.query<{ readonly extraction_id: string }>(
        `SELECT extraction_id
         FROM storyrail.source_extractions
         WHERE extraction_id = $1 AND source_id = $2`,
        [preparation.extractionId, preparation.sourceId],
      );
      if (!extraction.rows[0]) {
        return {
          ok: false,
          error: {
            code: "SOURCE_EXTRACTION_NOT_FOUND",
            message: "The Source extraction referenced by the preparation does not exist.",
            extractionId: preparation.extractionId as SourceExtractionId,
          },
        };
      }
      throw invariantError();
    },

    async listBySourceId(sourceId) {
      const result = await options.pool.query<PayloadRow>(
        `SELECT payload
         FROM storyrail.source_evidence_preparations
         WHERE source_id = $1
         ORDER BY append_position ASC`,
        [sourceId],
      );
      return result.rows.map((row) =>
        decodePostgresSourceEvidencePreparation(row.payload, invariantError),
      );
    },
  };
}
