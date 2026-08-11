import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { Story, StoryId, StoryState } from "@/domain/editorial";
import { STORY_STATES } from "@/domain/editorial";
import type { PersistStoryResult, StoryRepository } from "@/application/story-persistence";

export interface CreatePostgresStoryRepositoryOptions {
  readonly pool: Pool;
}

interface StoryPayloadRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly state: unknown;
  readonly revision_cycle: unknown;
  readonly payload: unknown;
}

class PostgresStoryPersistenceInvariantError extends Error {
  constructor() {
    super("PostgreSQL Story persistence returned an invalid or impossible result.");
    this.name = "PostgresStoryPersistenceInvariantError";
  }
}

function invariantError(): PostgresStoryPersistenceInvariantError {
  return new PostgresStoryPersistenceInvariantError();
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

function decodeStory(row: StoryPayloadRow): Story {
  const { payload } = row;

  if (
    typeof row.story_id !== "string" ||
    !isStoryState(row.state) ||
    !Number.isInteger(row.revision_cycle) ||
    (row.revision_cycle as number) < 0 ||
    (row.revision_cycle as number) > 2 ||
    !isRecord(payload) ||
    !hasExactKeys(payload, ["id", "title", "state", "revisionCycle", "createdAt", "updatedAt"]) ||
    typeof payload.id !== "string" ||
    payload.id !== row.story_id ||
    typeof payload.title !== "string" ||
    payload.title.length === 0 ||
    payload.title !== payload.title.trim() ||
    !isStoryState(payload.state) ||
    payload.state !== row.state ||
    !Number.isInteger(payload.revisionCycle) ||
    payload.revisionCycle !== row.revision_cycle ||
    typeof payload.createdAt !== "string" ||
    typeof payload.updatedAt !== "string"
  ) {
    throw invariantError();
  }

  return structuredClone(payload) as unknown as Story;
}

function serializeStory(story: Story): string {
  const serialized = JSON.stringify(story);

  if (serialized === undefined) {
    throw new TypeError("The Story could not be serialized as JSON.");
  }

  return serialized;
}

async function findStoryById(pool: Pool, storyIdentity: StoryId): Promise<Story | null> {
  const result = await pool.query<StoryPayloadRow>(
    `SELECT story_id, state, revision_cycle, payload
     FROM storyrail.stories
     WHERE story_id = $1`,
    [storyIdentity],
  );
  const row = result.rows[0];
  return row ? decodeStory(row) : null;
}

export function createPostgresStoryRepository(
  options: CreatePostgresStoryRepositoryOptions,
): StoryRepository {
  const { pool } = options;

  return {
    findById: (storyIdentity) => findStoryById(pool, storyIdentity),
    async persist({ story }): Promise<PersistStoryResult> {
      const payload = serializeStory(story);
      const inserted = await pool.query<StoryPayloadRow>(
        `INSERT INTO storyrail.stories (story_id, state, revision_cycle, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING story_id, state, revision_cycle, payload`,
        [story.id, story.state, story.revisionCycle, payload],
      );

      if (inserted.rows[0]) {
        return { ok: true, story: decodeStory(inserted.rows[0]) };
      }

      const existing = await findStoryById(pool, story.id);

      if (!existing) {
        throw invariantError();
      }

      if (isDeepStrictEqual(existing, story)) {
        return { ok: true, story: structuredClone(existing) };
      }

      return {
        ok: false,
        error: {
          code: "STORY_ID_CONFLICT",
          message: "A different Story with the same Story ID already exists.",
          storyId: story.id,
        },
      };
    },
  };
}
