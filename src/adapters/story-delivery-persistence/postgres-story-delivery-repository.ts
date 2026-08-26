import type { Pool } from "pg";

import type {
  AppendStoryDeliveryResult,
  CompleteStoryDeliveryResult,
  StoryDeliveryRepository,
} from "@/application/story-deliveries";
import type { StoryDelivery, StoryId } from "@/domain/editorial";

import { decodePostgresStoryDelivery } from "./postgres-story-delivery-decoder";

export function createPostgresStoryDeliveryRepository(dependencies: {
  readonly pool: Pool;
}): StoryDeliveryRepository {
  return {
    async append(delivery: StoryDelivery): Promise<AppendStoryDeliveryResult> {
      try {
        await dependencies.pool.query(
          `INSERT INTO storyrail.story_deliveries
             (delivery_id, story_id, revision_id, destination, remote_id, outcome, started_at, completed_at, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
          [
            delivery.id,
            delivery.storyId,
            delivery.revisionId,
            delivery.destination,
            delivery.remoteId,
            delivery.outcome,
            delivery.startedAt,
            delivery.completedAt,
            JSON.stringify(delivery),
          ],
        );
        return { ok: true, delivery };
      } catch (caught) {
        if ((caught as { readonly constraint?: string }).constraint === "story_deliveries_pkey")
          return {
            ok: false,
            error: {
              code: "STORY_DELIVERY_ID_CONFLICT",
              message: "A delivery with this identity already exists.",
            },
          };
        throw caught;
      }
    },

    async complete(delivery: StoryDelivery): Promise<CompleteStoryDeliveryResult> {
      const { rowCount } = await dependencies.pool.query(
        // remote_id is written here rather than on append, because a create only learns which
        // page it made from the answer. The trigger allows this exactly once and only from null.
        `UPDATE storyrail.story_deliveries
         SET outcome = $2, completed_at = $3, remote_id = $4, payload = $5::jsonb
         WHERE delivery_id = $1 AND outcome = 'running'`,
        [
          delivery.id,
          delivery.outcome,
          delivery.completedAt,
          delivery.remoteId,
          JSON.stringify(delivery),
        ],
      );
      return rowCount === 0
        ? {
            ok: false,
            error: {
              code: "STORY_DELIVERY_NOT_RUNNING",
              message: "The delivery is not in flight.",
            },
          }
        : { ok: true, delivery };
    },

    async findLatestSucceeded(query): Promise<StoryDelivery | null> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT payload FROM storyrail.story_deliveries
         WHERE story_id = $1 AND destination = $2 AND outcome = 'succeeded'
         ORDER BY started_at DESC
         LIMIT 1`,
        [query.storyId, query.destination],
      );
      const row = rows[0];
      return row ? decodePostgresStoryDelivery(row.payload) : null;
    },

    async listByStoryId(storyId: StoryId): Promise<readonly StoryDelivery[]> {
      const { rows } = await dependencies.pool.query<{ payload: unknown }>(
        `SELECT payload FROM storyrail.story_deliveries
         WHERE story_id = $1 ORDER BY started_at`,
        [storyId],
      );
      return rows.map((row) => decodePostgresStoryDelivery(row.payload));
    },
  };
}
