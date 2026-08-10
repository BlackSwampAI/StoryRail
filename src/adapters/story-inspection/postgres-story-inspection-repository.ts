import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentRole,
  AgentRunId,
  CanonicalSourceUrl,
  EditorialActor,
  OperatorId,
  SourceEvidencePreparation,
  SourceExtraction,
  SourceId,
  Story,
  StoryId,
  StorySourceAttachment,
  StoryState,
  UrlSource,
} from "@/domain/editorial";
import { AGENT_ROLES, STORY_STATES } from "@/domain/editorial";
import type { InspectStoryResult, StoryInspectionRepository } from "@/application/story-inspection";

import { decodePostgresSourceExtraction } from "../source-persistence/postgres-source-extraction-decoder";
import { decodePostgresSourceEvidencePreparation } from "../source-evidence-preparation-persistence/postgres-source-evidence-preparation-decoder";

export interface CreatePostgresStoryInspectionRepositoryOptions {
  readonly pool: Pool;
}

interface StoryInspectionRow extends QueryResultRow {
  readonly story_id: unknown;
  readonly story_state: unknown;
  readonly story_revision_cycle: unknown;
  readonly story_payload: unknown;
  readonly attachment_story_id: unknown;
  readonly attachment_source_id: unknown;
  readonly attachment_payload: unknown;
  readonly source_id: unknown;
  readonly source_canonical_url: unknown;
  readonly source_payload: unknown;
  readonly extraction_payloads: unknown;
  readonly preparation_payloads: unknown;
}

interface AssembledStoryInspectionSource {
  readonly attachment: StorySourceAttachment;
  readonly source: UrlSource;
  readonly extractions: SourceExtraction[];
  readonly preparations: SourceEvidencePreparation[];
}

class PostgresStoryInspectionPersistenceInvariantError extends Error {
  constructor() {
    super("PostgreSQL Story inspection returned an invalid or impossible persisted result.");
    this.name = "PostgresStoryInspectionPersistenceInvariantError";
  }
}

function invariantError(): PostgresStoryInspectionPersistenceInvariantError {
  return new PostgresStoryInspectionPersistenceInvariantError();
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
    return { type: "agent", role: value.role, runId: value.runId as AgentRunId };
  }

  throw invariantError();
}

function decodeStory(row: StoryInspectionRow): Story {
  const payload = row.story_payload;

  if (
    typeof row.story_id !== "string" ||
    !isStoryState(row.story_state) ||
    !Number.isInteger(row.story_revision_cycle) ||
    (row.story_revision_cycle as number) < 0 ||
    (row.story_revision_cycle as number) > 2 ||
    !isRecord(payload) ||
    !hasExactKeys(payload, ["id", "title", "state", "revisionCycle", "createdAt", "updatedAt"]) ||
    typeof payload.id !== "string" ||
    payload.id !== row.story_id ||
    typeof payload.title !== "string" ||
    payload.title.length === 0 ||
    payload.title !== payload.title.trim() ||
    !isStoryState(payload.state) ||
    payload.state !== row.story_state ||
    !Number.isInteger(payload.revisionCycle) ||
    payload.revisionCycle !== row.story_revision_cycle ||
    typeof payload.createdAt !== "string" ||
    typeof payload.updatedAt !== "string"
  ) {
    throw invariantError();
  }

  return structuredClone(payload) as unknown as Story;
}

function decodeSource(row: StoryInspectionRow): UrlSource {
  const payload = row.source_payload;

  if (
    typeof row.source_id !== "string" ||
    typeof row.source_canonical_url !== "string" ||
    !isRecord(payload) ||
    !hasExactKeys(payload, [
      "id",
      "type",
      "submittedUrl",
      "canonicalUrl",
      "submittedBy",
      "receivedAt",
    ]) ||
    typeof payload.id !== "string" ||
    payload.id !== row.source_id ||
    payload.type !== "url" ||
    typeof payload.submittedUrl !== "string" ||
    typeof payload.canonicalUrl !== "string" ||
    payload.canonicalUrl !== row.source_canonical_url ||
    typeof payload.receivedAt !== "string"
  ) {
    throw invariantError();
  }

  return {
    id: payload.id as SourceId,
    type: "url",
    submittedUrl: payload.submittedUrl,
    canonicalUrl: payload.canonicalUrl as CanonicalSourceUrl,
    submittedBy: decodeActor(payload.submittedBy),
    receivedAt: payload.receivedAt,
  };
}

function decodeAttachment(row: StoryInspectionRow): StorySourceAttachment {
  const payload = row.attachment_payload;

  if (
    typeof row.attachment_story_id !== "string" ||
    typeof row.attachment_source_id !== "string" ||
    !isRecord(payload) ||
    !hasExactKeys(payload, ["storyId", "sourceId", "relevance", "attachedBy", "attachedAt"]) ||
    typeof payload.storyId !== "string" ||
    payload.storyId !== row.attachment_story_id ||
    payload.storyId !== row.story_id ||
    typeof payload.sourceId !== "string" ||
    payload.sourceId !== row.attachment_source_id ||
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

function hasNoAttachedSource(row: StoryInspectionRow): boolean {
  return (
    row.attachment_story_id === null &&
    row.attachment_source_id === null &&
    row.attachment_payload === null &&
    row.source_id === null &&
    row.source_canonical_url === null &&
    row.source_payload === null &&
    row.extraction_payloads === null &&
    row.preparation_payloads === null
  );
}

function decodeExtractions(row: StoryInspectionRow, source: UrlSource): SourceExtraction[] {
  if (!Array.isArray(row.extraction_payloads)) throw invariantError();
  return row.extraction_payloads.map((payload) => {
    const extraction = decodePostgresSourceExtraction(payload, invariantError);
    if (extraction.sourceId !== source.id) throw invariantError();
    return extraction;
  });
}

function decodePreparations(
  row: StoryInspectionRow,
  source: UrlSource,
): SourceEvidencePreparation[] {
  if (!Array.isArray(row.preparation_payloads)) throw invariantError();
  return row.preparation_payloads.map((payload) => {
    const preparation = decodePostgresSourceEvidencePreparation(payload, invariantError);
    if (preparation.sourceId !== source.id) throw invariantError();
    return preparation;
  });
}

export function createPostgresStoryInspectionRepository(
  options: CreatePostgresStoryInspectionRepositoryOptions,
): StoryInspectionRepository {
  const { pool } = options;

  return {
    async inspect(storyIdentity): Promise<InspectStoryResult> {
      const result = await pool.query<StoryInspectionRow>(
        `SELECT story.story_id,
                story.state AS story_state,
                story.revision_cycle AS story_revision_cycle,
                story.payload AS story_payload,
                attachment.story_id AS attachment_story_id,
                attachment.source_id AS attachment_source_id,
                attachment.payload AS attachment_payload,
                source.source_id,
                source.canonical_url AS source_canonical_url,
                source.payload AS source_payload,
                CASE WHEN source.source_id IS NULL THEN NULL ELSE COALESCE((
                  SELECT jsonb_agg(extraction.payload ORDER BY extraction.append_position ASC)
                  FROM storyrail.source_extractions AS extraction
                  WHERE extraction.source_id = source.source_id
                ), '[]'::jsonb) END AS extraction_payloads,
                CASE WHEN source.source_id IS NULL THEN NULL ELSE COALESCE((
                  SELECT jsonb_agg(preparation.payload ORDER BY preparation.append_position ASC)
                  FROM storyrail.source_evidence_preparations AS preparation
                  WHERE preparation.source_id = source.source_id
                ), '[]'::jsonb) END AS preparation_payloads
         FROM storyrail.stories AS story
         LEFT JOIN storyrail.story_source_attachments AS attachment
           ON attachment.story_id = story.story_id
         LEFT JOIN storyrail.url_sources AS source
           ON source.source_id = attachment.source_id
         WHERE story.story_id = $1
         ORDER BY attachment.source_id COLLATE "C" ASC`,
        [storyIdentity],
      );

      if (result.rows.length === 0) {
        return {
          ok: false,
          error: {
            code: "STORY_NOT_FOUND",
            message: "The Story to inspect does not exist.",
            storyId: storyIdentity,
          },
        };
      }

      const firstRow = result.rows[0];
      if (!firstRow) {
        throw invariantError();
      }
      const story = decodeStory(firstRow);
      if (story.id !== storyIdentity) {
        throw invariantError();
      }
      const sources: AssembledStoryInspectionSource[] = [];
      const seenSourceIds = new Set<SourceId>();

      for (const row of result.rows) {
        const rowStory = decodeStory(row);
        if (!isDeepStrictEqual(rowStory, story)) {
          throw invariantError();
        }

        if (hasNoAttachedSource(row)) {
          if (result.rows.length !== 1) {
            throw invariantError();
          }
          continue;
        }

        const attachment = decodeAttachment(row);
        const source = decodeSource(row);
        if (seenSourceIds.has(source.id)) {
          throw invariantError();
        }
        seenSourceIds.add(source.id);
        sources.push({
          attachment,
          source,
          extractions: decodeExtractions(row, source),
          preparations: decodePreparations(row, source),
        });
      }

      return { ok: true, inspection: { story, sources } };
    },
  };
}
