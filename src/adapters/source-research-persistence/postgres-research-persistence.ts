import type { Pool } from "pg";

import type {
  AttachResearchedSourceResult,
  ResearchPersistence,
} from "@/application/source-research";
import { attachSourceToStory, type SiteId } from "@/domain/editorial";

/**
 * A researched Source, the evidence behind it, and its attachment are written in one
 * transaction. Any of the three alone would leave a Story resting on something that is not
 * there: a Source nobody read, evidence attached to nothing, or an attachment to a Source that
 * was never stored.
 */
export function createPostgresResearchPersistence(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): ResearchPersistence {
  return {
    async attach(command): Promise<AttachResearchedSourceResult> {
      const attachment = attachSourceToStory({
        storyId: command.storyId,
        sourceId: command.source.id,
        relevance: command.relevance,
        attachedBy: command.attachedBy,
        attachedAt: command.attachedAt,
      });
      if (!attachment.ok)
        return {
          ok: false,
          error: { code: attachment.error.code, message: attachment.error.message },
        };

      const client = await dependencies.pool.connect();
      try {
        await client.query("BEGIN");
        const stored = await client.query(
          `INSERT INTO storyrail.url_sources (source_id, canonical_url, payload, site_id)
           VALUES ($1, $2, $3::jsonb, $4)
           ON CONFLICT DO NOTHING
           RETURNING source_id`,
          [
            command.source.id,
            command.source.canonicalUrl,
            JSON.stringify(command.source),
            dependencies.siteId,
          ],
        );
        // Already recorded means already recorded *here*. A canonical URL is unique within a
        // newsroom, so a page another Site ingested first is still new evidence to this one.
        if (stored.rowCount === 0) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            error: {
              code: "RESEARCHED_SOURCE_CONFLICT",
              message: "This Source is already recorded.",
            },
          };
        }
        await client.query(
          `INSERT INTO storyrail.source_extractions (extraction_id, source_id, outcome, payload)
           VALUES ($1, $2, $3, $4::jsonb)`,
          [
            command.extraction.id,
            command.extraction.sourceId,
            command.extraction.outcome,
            JSON.stringify(command.extraction),
          ],
        );
        await client.query(
          `INSERT INTO storyrail.story_source_attachments (story_id, source_id, payload, site_id)
           VALUES ($1, $2, $3::jsonb, $4)`,
          [
            command.storyId,
            command.source.id,
            JSON.stringify(attachment.attachment),
            dependencies.siteId,
          ],
        );
        await client.query("COMMIT");
        return {
          ok: true,
          source: command.source,
          extraction: command.extraction,
          attachment: attachment.attachment,
        };
      } catch (caught) {
        await client.query("ROLLBACK");
        throw caught;
      } finally {
        client.release();
      }
    },
  };
}
