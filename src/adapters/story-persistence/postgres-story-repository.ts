import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type { SiteId, Story, StoryId, StoryState } from "@/domain/editorial";
import { STORY_STATES } from "@/domain/editorial";
import { storySchema } from "@/domain/editorial";
import type { PersistStoryResult, StoryRepository } from "@/application/story-persistence";

export interface CreatePostgresStoryRepositoryOptions {
  readonly pool: Pool;
  readonly siteId: SiteId;
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
    !["id", "title", "state", "revisionCycle", "createdAt", "updatedAt"].every(
      (key) => key in payload,
    ) ||
    !storySchema.safeParse(payload).success ||
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

async function findStoryById(
  pool: Pool,
  siteId: SiteId,
  storyIdentity: StoryId,
): Promise<Story | null> {
  const result = await pool.query<StoryPayloadRow>(
    `SELECT story_id, state, revision_cycle, payload
     FROM storyrail.stories
     WHERE story_id = $1
       AND site_id = $2`,
    [storyIdentity, siteId],
  );
  const row = result.rows[0];
  return row ? decodeStory(row) : null;
}

export function createPostgresStoryRepository(
  options: CreatePostgresStoryRepositoryOptions,
): StoryRepository {
  const { pool, siteId } = options;

  return {
    findById: (storyIdentity) => findStoryById(pool, siteId, storyIdentity),
    async updatePurpose(command) {
      const existing = await findStoryById(pool, siteId, command.storyId);
      if (!existing)
        return {
          ok: false,
          error: { code: "STORY_NOT_FOUND", message: "The Story to update does not exist." },
        };
      if (existing.state !== "intake")
        return {
          ok: false,
          error: {
            code: "STORY_PURPOSE_LOCKED",
            message: "Story purpose can only be edited before assignment.",
          },
        };
      const next: Story = {
        ...existing,
        purpose: {
          readerValue: command.purpose.readerValue.trim(),
          focus: command.purpose.focus.trim(),
        },
        purposeUpdatedAt: command.updatedAt,
        purposeUpdatedBy: command.updatedBy,
        updatedAt: command.updatedAt,
      };
      const updated = await pool.query<StoryPayloadRow>(
        `UPDATE storyrail.stories AS story
         SET payload = $3::jsonb
         WHERE story.story_id = $1 AND story.site_id = $2 AND story.state = 'intake'
           AND story.payload = $4::jsonb
           AND NOT EXISTS (
             SELECT 1 FROM storyrail.agent_runs AS run
             WHERE run.story_id = story.story_id AND run.outcome = 'running'
           )
         RETURNING story_id, state, revision_cycle, payload`,
        [command.storyId, siteId, serializeStory(next), JSON.stringify(existing)],
      );
      if (updated.rows[0]) return { ok: true, story: decodeStory(updated.rows[0]) };
      const active = await pool.query(
        `SELECT 1 FROM storyrail.agent_runs WHERE story_id = $1 AND outcome = 'running' LIMIT 1`,
        [command.storyId],
      );
      return {
        ok: false,
        error: active.rows.length
          ? {
              code: "STORY_AGENT_RUN_ACTIVE",
              message: "Story purpose cannot change while an agent run is active.",
            }
          : {
              code: "STORY_PURPOSE_LOCKED",
              message: "Story changed while purpose was being updated; reload and try again.",
            },
      };
    },
    async persist({ story }): Promise<PersistStoryResult> {
      const payload = serializeStory(story);
      const inserted = await pool.query<StoryPayloadRow>(
        `INSERT INTO storyrail.stories (story_id, state, revision_cycle, payload, site_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT DO NOTHING
         RETURNING story_id, state, revision_cycle, payload`,
        [story.id, story.state, story.revisionCycle, payload, siteId],
      );

      if (inserted.rows[0]) {
        return { ok: true, story: decodeStory(inserted.rows[0]) };
      }

      const existing = await findStoryById(pool, siteId, story.id);

      // The identifier is taken, but by a Story on another Site. Reporting the conflict rather
      // than the other Story is what keeps the two newsrooms from learning about each other.
      if (!existing) {
        return {
          ok: false,
          error: {
            code: "STORY_ID_CONFLICT",
            message: "A different Story with the same Story ID already exists.",
            storyId: story.id,
          },
        };
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
