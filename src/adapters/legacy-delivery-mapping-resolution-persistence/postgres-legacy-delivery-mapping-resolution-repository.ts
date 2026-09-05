import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";

import type {
  AppendLegacyDeliveryMappingResolutionResult,
  LegacyDeliveryMappingResolutionRepository,
} from "@/application/story-deliveries";
import type { LegacyDeliveryMappingResolution, SiteId } from "@/domain/editorial";

import { decodePostgresLegacyDeliveryMappingResolution } from "./postgres-legacy-delivery-mapping-resolution-decoder";

export function createPostgresLegacyDeliveryMappingResolutionRepository(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): LegacyDeliveryMappingResolutionRepository {
  return {
    async append(
      resolution: LegacyDeliveryMappingResolution,
    ): Promise<AppendLegacyDeliveryMappingResolutionResult> {
      const payload = JSON.stringify(resolution);
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `INSERT INTO storyrail.legacy_delivery_mapping_resolutions
           (resolution_id, story_id, legacy_delivery_id, destination, destination_instance_id,
            remote_id, decision, decided_at, payload)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
         FROM storyrail.stories AS story
         WHERE story.story_id = $2 AND story.site_id = $10
         ON CONFLICT (resolution_id) DO NOTHING
         RETURNING payload`,
        [
          resolution.id,
          resolution.storyId,
          resolution.legacyDeliveryId,
          resolution.destination,
          resolution.destinationInstanceId,
          resolution.remoteId,
          resolution.decision,
          resolution.decidedAt,
          payload,
          dependencies.siteId,
        ],
      );
      if (rows[0])
        return {
          ok: true,
          resolution: decodePostgresLegacyDeliveryMappingResolution(rows[0].payload),
        };

      const existing = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT resolution.payload
         FROM storyrail.legacy_delivery_mapping_resolutions AS resolution
         JOIN storyrail.stories AS story ON story.story_id = resolution.story_id
         WHERE resolution.resolution_id = $1 AND story.site_id = $2`,
        [resolution.id, dependencies.siteId],
      );
      const row = existing.rows[0];
      if (row) {
        const persisted = decodePostgresLegacyDeliveryMappingResolution(row.payload);
        if (isDeepStrictEqual(persisted, resolution)) return { ok: true, resolution: persisted };
      }
      return {
        ok: false,
        error: {
          code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT",
          message: "A different legacy delivery mapping resolution already has this identity.",
        },
      };
    },

    async findLatest(query): Promise<LegacyDeliveryMappingResolution | null> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT resolution.payload
         FROM storyrail.legacy_delivery_mapping_resolutions AS resolution
         JOIN storyrail.stories AS story ON story.story_id = resolution.story_id
         WHERE resolution.story_id = $1
           AND resolution.legacy_delivery_id = $2
           AND resolution.destination_instance_id = $3
           AND story.site_id = $4
         ORDER BY resolution.insertion_position DESC
         LIMIT 1`,
        [query.storyId, query.legacyDeliveryId, query.destinationInstanceId, dependencies.siteId],
      );
      return rows[0] ? decodePostgresLegacyDeliveryMappingResolution(rows[0].payload) : null;
    },
  };
}
