import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";

import type {
  AppendStoryDeliveryReconciliationResult,
  StoryDeliveryReconciliationRepository,
} from "@/application/story-deliveries";
import type { SiteId, StoryDeliveryReconciliation } from "@/domain/editorial";

import { decodePostgresStoryDeliveryReconciliation } from "./postgres-story-delivery-reconciliation-decoder";

export function createPostgresStoryDeliveryReconciliationRepository(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): StoryDeliveryReconciliationRepository {
  return {
    async append(
      reconciliation: StoryDeliveryReconciliation,
    ): Promise<AppendStoryDeliveryReconciliationResult> {
      const payload = JSON.stringify(reconciliation);
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `INSERT INTO storyrail.story_delivery_reconciliations
           (reconciliation_id, story_id, delivery_id, destination, destination_instance_id,
            operation, slug, decision, remote_id, decided_at, payload)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
         FROM storyrail.stories AS story
         WHERE story.story_id = $2 AND story.site_id = $12
         ON CONFLICT (reconciliation_id) DO NOTHING
         RETURNING payload`,
        [
          reconciliation.id,
          reconciliation.storyId,
          reconciliation.deliveryId,
          reconciliation.destination,
          reconciliation.destinationInstanceId,
          reconciliation.operation,
          reconciliation.slug,
          reconciliation.decision,
          reconciliation.remoteId,
          reconciliation.decidedAt,
          payload,
          dependencies.siteId,
        ],
      );
      if (rows[0])
        return {
          ok: true,
          reconciliation: decodePostgresStoryDeliveryReconciliation(rows[0].payload),
        };

      const existing = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT reconciliation.payload
         FROM storyrail.story_delivery_reconciliations AS reconciliation
         JOIN storyrail.stories AS story ON story.story_id = reconciliation.story_id
         WHERE reconciliation.reconciliation_id = $1 AND story.site_id = $2`,
        [reconciliation.id, dependencies.siteId],
      );
      const row = existing.rows[0];
      if (row) {
        const persisted = decodePostgresStoryDeliveryReconciliation(row.payload);
        if (isDeepStrictEqual(persisted, reconciliation))
          return { ok: true, reconciliation: persisted };
      }
      return {
        ok: false,
        error: {
          code: "STORY_DELIVERY_RECONCILIATION_CONFLICT",
          message: "A different Story delivery reconciliation already has this identity.",
        },
      };
    },

    async findLatest(query): Promise<StoryDeliveryReconciliation | null> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT reconciliation.payload
         FROM storyrail.story_delivery_reconciliations AS reconciliation
         JOIN storyrail.stories AS story ON story.story_id = reconciliation.story_id
         WHERE reconciliation.story_id = $1
           AND reconciliation.delivery_id = $2
           AND reconciliation.destination_instance_id = $3
           AND story.site_id = $4
         ORDER BY reconciliation.insertion_position DESC
         LIMIT 1`,
        [query.storyId, query.deliveryId, query.destinationInstanceId, dependencies.siteId],
      );
      return rows[0] ? decodePostgresStoryDeliveryReconciliation(rows[0].payload) : null;
    },
  };
}
