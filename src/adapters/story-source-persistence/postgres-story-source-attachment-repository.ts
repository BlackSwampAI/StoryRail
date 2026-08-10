import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentRole,
  AgentRunId,
  EditorialActor,
  OperatorId,
  SourceId,
  StoryId,
  StorySourceAttachment,
} from "@/domain/editorial";
import { AGENT_ROLES } from "@/domain/editorial";
import type {
  AttachStorySourceResult,
  StorySourceAttachmentRepository,
} from "@/application/story-source-persistence";

export interface CreatePostgresStorySourceAttachmentRepositoryOptions {
  readonly pool: Pool;
}

interface AttachmentPayloadRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly source_id: unknown;
  readonly payload: unknown;
}

interface ExistsRow extends QueryResultRow {
  readonly exists: unknown;
}

class PostgresStorySourceAttachmentPersistenceInvariantError extends Error {
  constructor() {
    super(
      "PostgreSQL Story-Source attachment persistence returned an invalid or impossible result.",
    );
    this.name = "PostgresStorySourceAttachmentPersistenceInvariantError";
  }
}

function invariantError(): PostgresStorySourceAttachmentPersistenceInvariantError {
  return new PostgresStorySourceAttachmentPersistenceInvariantError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

function decodeActor(value: unknown): EditorialActor {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw invariantError();
  }

  if (
    value.type === "operator" &&
    hasExactKeys(value, ["type", "operatorId"]) &&
    typeof value.operatorId === "string"
  ) {
    return { type: "operator", operatorId: value.operatorId as OperatorId };
  }

  if (
    value.type === "agent" &&
    hasExactKeys(value, ["type", "role", "runId"]) &&
    isAgentRole(value.role) &&
    typeof value.runId === "string"
  ) {
    return {
      type: "agent",
      role: value.role,
      runId: value.runId as AgentRunId,
    };
  }

  throw invariantError();
}

function decodeAttachment(row: AttachmentPayloadRow): StorySourceAttachment {
  const { payload } = row;

  if (
    typeof row.story_id !== "string" ||
    typeof row.source_id !== "string" ||
    !isRecord(payload) ||
    !hasExactKeys(payload, ["storyId", "sourceId", "relevance", "attachedBy", "attachedAt"]) ||
    typeof payload.storyId !== "string" ||
    payload.storyId !== row.story_id ||
    typeof payload.sourceId !== "string" ||
    payload.sourceId !== row.source_id ||
    typeof payload.relevance !== "string" ||
    payload.relevance.length === 0 ||
    payload.relevance !== payload.relevance.trim() ||
    typeof payload.attachedAt !== "string"
  ) {
    throw invariantError();
  }

  return {
    storyId: payload.storyId as StoryId,
    sourceId: payload.sourceId as SourceId,
    relevance: payload.relevance,
    attachedBy: decodeActor(payload.attachedBy),
    attachedAt: payload.attachedAt,
  };
}

function serializeAttachment(attachment: StorySourceAttachment): string {
  const serialized = JSON.stringify(attachment);

  if (serialized === undefined) {
    throw new TypeError("The Story-Source attachment could not be serialized as JSON.");
  }

  return serialized;
}

async function findAttachment(
  pool: Pool,
  storyIdentity: StoryId,
  sourceIdentity: SourceId,
): Promise<StorySourceAttachment | null> {
  const result = await pool.query<AttachmentPayloadRow>(
    `SELECT story_id, source_id, payload
     FROM storyrail.story_source_attachments
     WHERE story_id = $1
       AND source_id = $2`,
    [storyIdentity, sourceIdentity],
  );
  return result.rows[0] ? decodeAttachment(result.rows[0]) : null;
}

async function parentExists(
  pool: Pool,
  table: "stories" | "url_sources",
  id: string,
): Promise<boolean> {
  const identityColumn = table === "stories" ? "story_id" : "source_id";
  const result = await pool.query<ExistsRow>(
    `SELECT EXISTS (
       SELECT 1
       FROM storyrail.${table}
       WHERE ${identityColumn} = $1
     ) AS exists`,
    [id],
  );

  if (typeof result.rows[0]?.exists !== "boolean") {
    throw invariantError();
  }

  return result.rows[0].exists;
}

export function createPostgresStorySourceAttachmentRepository(
  options: CreatePostgresStorySourceAttachmentRepositoryOptions,
): StorySourceAttachmentRepository {
  const { pool } = options;

  return {
    async attach({ attachment }): Promise<AttachStorySourceResult> {
      const payload = serializeAttachment(attachment);
      const inserted = await pool.query<AttachmentPayloadRow>(
        `INSERT INTO storyrail.story_source_attachments (story_id, source_id, payload)
         SELECT $1, $2, $3::jsonb
         FROM storyrail.stories
         CROSS JOIN storyrail.url_sources
         WHERE stories.story_id = $1
           AND url_sources.source_id = $2
         ON CONFLICT DO NOTHING
         RETURNING story_id, source_id, payload`,
        [attachment.storyId, attachment.sourceId, payload],
      );

      if (inserted.rows[0]) {
        return { ok: true, attachment: decodeAttachment(inserted.rows[0]) };
      }

      const existing = await findAttachment(pool, attachment.storyId, attachment.sourceId);

      if (existing) {
        if (isDeepStrictEqual(existing, attachment)) {
          return { ok: true, attachment: structuredClone(existing) };
        }

        return {
          ok: false,
          error: {
            code: "STORY_SOURCE_CONFLICT",
            message:
              "A different Story-Source attachment for the same Story and Source already exists.",
            storyId: attachment.storyId,
            sourceId: attachment.sourceId,
          },
        };
      }

      if (!(await parentExists(pool, "stories", attachment.storyId))) {
        return {
          ok: false,
          error: {
            code: "STORY_NOT_FOUND",
            message: "The Story referenced by the attachment does not exist.",
            storyId: attachment.storyId,
          },
        };
      }

      if (!(await parentExists(pool, "url_sources", attachment.sourceId))) {
        return {
          ok: false,
          error: {
            code: "SOURCE_NOT_FOUND",
            message: "The Source referenced by the attachment does not exist.",
            sourceId: attachment.sourceId,
          },
        };
      }

      throw invariantError();
    },
  };
}
