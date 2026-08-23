import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { StoryListItem, StoryListingRepository } from "@/application/story-listing";
import { STORY_STATES, type SiteId, type Story, type StoryState } from "@/domain/editorial";

export interface CreatePostgresStoryListingRepositoryOptions {
  readonly pool: Pool;
  readonly siteId: SiteId;
}

interface StoryListingRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly story_state: unknown;
  readonly story_revision_cycle: unknown;
  readonly story_payload: unknown;
  readonly source_count: unknown;
}

class PostgresStoryListingPersistenceInvariantError extends Error {
  constructor() {
    super("PostgreSQL Story listing returned an invalid persisted result.");
    this.name = "PostgresStoryListingPersistenceInvariantError";
  }
}

function invariantError(): PostgresStoryListingPersistenceInvariantError {
  return new PostgresStoryListingPersistenceInvariantError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function isStoryState(value: unknown): value is StoryState {
  return typeof value === "string" && (STORY_STATES as readonly string[]).includes(value);
}

function decodeStory(row: StoryListingRow): Story {
  const payload = row.story_payload;

  if (
    typeof row.story_id !== "string" ||
    !isStoryState(row.story_state) ||
    !Number.isInteger(row.story_revision_cycle) ||
    (row.story_revision_cycle as number) < 0 ||
    (row.story_revision_cycle as number) > 2 ||
    !isRecord(payload) ||
    !hasExactKeys(payload, ["id", "title", "state", "revisionCycle", "createdAt", "updatedAt"]) ||
    payload.id !== row.story_id ||
    typeof payload.title !== "string" ||
    payload.title.length === 0 ||
    payload.title !== payload.title.trim() ||
    payload.state !== row.story_state ||
    payload.revisionCycle !== row.story_revision_cycle ||
    typeof payload.createdAt !== "string" ||
    typeof payload.updatedAt !== "string"
  ) {
    throw invariantError();
  }

  return structuredClone(payload) as unknown as Story;
}

function decodeSourceCount(value: unknown): number {
  const count = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(count) || (count as number) < 0) {
    throw invariantError();
  }
  return count as number;
}

export function createPostgresStoryListingRepository(
  options: CreatePostgresStoryListingRepositoryOptions,
): StoryListingRepository {
  const { pool, siteId } = options;

  return {
    async list(): Promise<readonly StoryListItem[]> {
      const result = await pool.query<StoryListingRow>(
        `SELECT story.story_id,
                story.state AS story_state,
                story.revision_cycle AS story_revision_cycle,
                story.payload AS story_payload,
                COUNT(attachment.source_id)::text AS source_count
         FROM storyrail.stories AS story
         LEFT JOIN storyrail.story_source_attachments AS attachment
           ON attachment.story_id = story.story_id
         WHERE story.site_id = $1
         GROUP BY story.story_id, story.state, story.revision_cycle, story.payload
         ORDER BY story.story_id COLLATE "C" ASC`,
        [siteId],
      );

      return result.rows.map((row) => ({
        story: decodeStory(row),
        sourceCount: decodeSourceCount(row.source_count),
      }));
    },
  };
}
