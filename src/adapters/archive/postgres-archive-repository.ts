import type { Pool, QueryResultRow } from "pg";

import { decodePostgresArticleRevision } from "@/adapters/article-persistence";
import type { ArchiveRepository, ArchiveSearchQuery } from "@/application/archive";
import {
  MAXIMUM_ARCHIVE_RESULTS,
  type PriorReport,
  type PriorReportSource,
} from "@/domain/editorial";

export interface CreatePostgresArchiveRepositoryOptions {
  readonly pool: Pool;
}

interface ArchiveRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly published_at: unknown;
  readonly revision_id: unknown;
  readonly article_id: unknown;
  readonly revision_number: unknown;
  readonly writer_profile_id: unknown;
  readonly agent_run_id: unknown;
  readonly payload: unknown;
  readonly sources: unknown;
}

class PostgresArchiveInvariantError extends Error {
  constructor() {
    super("PostgreSQL archive search returned an invalid persisted result.");
    this.name = "PostgresArchiveInvariantError";
  }
}

/**
 * The latest Revision of every published Story, ranked by how well its words match.
 *
 * `websearch_to_tsquery` is used rather than a pattern built from the agent's text: whatever an
 * agent asks for is parsed as a search phrase and can never become query syntax. Only Stories in
 * `published` are considered, so nothing an agent reads here is work the newsroom has not stood
 * behind.
 */
const SEARCH_SQL = `
WITH published AS (
  SELECT story.story_id,
         article.article_id,
         (
           SELECT receipt.payload ->> 'occurredAt'
           FROM storyrail.story_transition_receipts AS receipt
           WHERE receipt.story_id = story.story_id AND receipt.next_state = 'published'
           ORDER BY receipt.append_position DESC
           LIMIT 1
         ) AS published_at
  FROM storyrail.stories AS story
  JOIN storyrail.articles AS article ON article.story_id = story.story_id
  WHERE story.state = 'published'
    AND ($2::text IS NULL OR story.story_id <> $2::text)
),
latest AS (
  SELECT DISTINCT ON (revision.article_id)
         revision.article_id,
         revision.revision_id,
         revision.revision_number,
         revision.writer_profile_id,
         revision.agent_run_id,
         revision.payload,
         revision.search_text
  FROM storyrail.article_revisions AS revision
  JOIN published ON published.article_id = revision.article_id
  ORDER BY revision.article_id, revision.revision_number DESC
)
SELECT published.story_id,
       published.published_at,
       latest.article_id,
       latest.revision_id,
       latest.revision_number,
       latest.writer_profile_id,
       latest.agent_run_id,
       latest.payload,
       COALESCE(
         (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'sourceId', source.source_id,
                      'url', source.canonical_url,
                      'relevance', attachment.payload ->> 'relevance'
                    )
                    ORDER BY source.canonical_url COLLATE "C" ASC
                  )
           FROM storyrail.story_source_attachments AS attachment
           JOIN storyrail.url_sources AS source ON source.source_id = attachment.source_id
           WHERE attachment.story_id = published.story_id
         ),
         '[]'::jsonb
       ) AS sources
FROM published
JOIN latest ON latest.article_id = published.article_id
WHERE latest.search_text @@ websearch_to_tsquery('english', $1::text)
ORDER BY ts_rank(latest.search_text, websearch_to_tsquery('english', $1::text)) DESC,
         published.published_at DESC NULLS LAST,
         published.story_id COLLATE "C" ASC
LIMIT $3::integer
`;

function decodeSources(value: unknown): readonly PriorReportSource[] {
  if (!Array.isArray(value)) throw new PostgresArchiveInvariantError();
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as { sourceId: unknown }).sourceId !== "string" ||
      typeof (entry as { url: unknown }).url !== "string" ||
      typeof (entry as { relevance: unknown }).relevance !== "string"
    )
      throw new PostgresArchiveInvariantError();
    return structuredClone(entry) as PriorReportSource;
  });
}

export function createPostgresArchiveRepository(
  options: CreatePostgresArchiveRepositoryOptions,
): ArchiveRepository {
  return {
    async search(query: ArchiveSearchQuery): Promise<readonly PriorReport[]> {
      const terms = query.terms.trim();
      if (terms.length === 0) return [];
      // The ceiling is applied here as well as asked for, so a caller cannot widen it.
      const limit = Math.max(1, Math.min(query.limit, MAXIMUM_ARCHIVE_RESULTS));

      const result = await options.pool.query<ArchiveRow>(SEARCH_SQL, [
        terms,
        query.excludeStoryId === null ? null : String(query.excludeStoryId),
        limit,
      ]);

      return result.rows.map((row) => {
        const revision = decodePostgresArticleRevision(row);
        // A published Story without a transition receipt saying when it was published is a
        // record that contradicts itself, not a report with an unknown date.
        if (typeof row.story_id !== "string" || typeof row.published_at !== "string")
          throw new PostgresArchiveInvariantError();
        return {
          storyId: row.story_id as PriorReport["storyId"],
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          headline: revision.headline,
          dek: revision.dek,
          publishedAt: row.published_at,
          blocks: revision.blocks,
          sources: decodeSources(row.sources),
        };
      });
    },
  };
}
