import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentProfile,
  AgentRun,
  Article,
  ArticleRevision,
  Assignment,
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
  StoryTransitionReceipt,
  UrlSource,
} from "@/domain/editorial";
import { AGENT_ROLES, STORY_STATES } from "@/domain/editorial";
import type { InspectStoryResult, StoryInspectionRepository } from "@/application/story-inspection";

import { decodePostgresSourceExtraction } from "../source-persistence/postgres-source-extraction-decoder";
import { decodePostgresSourceEvidencePreparation } from "../source-evidence-preparation-persistence/postgres-source-evidence-preparation-decoder";
import { decodePostgresAgentProfile } from "../agent-profile-persistence/postgres-agent-profile-decoder";
import {
  decodePostgresAssignment,
  decodePostgresTransitionReceipt,
} from "../assignment-persistence/postgres-assignment-decoder";
import { decodePostgresAgentRun } from "../agent-run-persistence/postgres-agent-run-decoder";
import {
  decodePostgresArticle,
  decodePostgresArticleRevision,
} from "../article-persistence/postgres-article-decoder";

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
  readonly assignment_id: unknown;
  readonly assignment_story_id: unknown;
  readonly writer_profile_id: unknown;
  readonly writer_role: unknown;
  readonly assignment_payload: unknown;
  readonly profile_id: unknown;
  readonly profile_role: unknown;
  readonly profile_built_in: unknown;
  readonly profile_payload: unknown;
  readonly transition_rows: unknown;
  readonly agent_run_rows: unknown;
  readonly article_id: unknown;
  readonly article_story_id: unknown;
  readonly article_assignment_id: unknown;
  readonly article_payload: unknown;
  readonly article_revision_rows: unknown;
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

function decodeAssignment(
  row: StoryInspectionRow,
): { readonly assignment: Assignment; readonly writerProfile: AgentProfile } | null {
  const values = [
    row.assignment_id,
    row.assignment_story_id,
    row.writer_profile_id,
    row.writer_role,
    row.assignment_payload,
    row.profile_id,
    row.profile_role,
    row.profile_built_in,
    row.profile_payload,
  ];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) throw invariantError();
  const assignment = decodePostgresAssignment({
    assignment_id: row.assignment_id,
    story_id: row.assignment_story_id,
    writer_profile_id: row.writer_profile_id,
    writer_role: row.writer_role,
    payload: row.assignment_payload,
  });
  const writerProfile = decodePostgresAgentProfile({
    profile_id: row.profile_id,
    role: row.profile_role,
    built_in: row.profile_built_in,
    payload: row.profile_payload,
  });
  if (
    assignment.storyId !== row.story_id ||
    assignment.writerProfileId !== writerProfile.id ||
    writerProfile.role !== "writer"
  )
    throw invariantError();
  return { assignment, writerProfile };
}

function decodeTransitions(row: StoryInspectionRow): StoryTransitionReceipt[] {
  if (!Array.isArray(row.transition_rows)) throw invariantError();
  return row.transition_rows.map((value) => {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "transition_id",
        "story_id",
        "previous_state",
        "next_state",
        "revision_cycle",
        "payload",
      ])
    )
      throw invariantError();
    const receipt = decodePostgresTransitionReceipt(
      value as {
        transition_id: unknown;
        story_id: unknown;
        previous_state: unknown;
        next_state: unknown;
        revision_cycle: unknown;
        payload: unknown;
      },
    );
    if (receipt.storyId !== row.story_id) throw invariantError();
    return receipt;
  });
}

function decodeAgentRuns(row: StoryInspectionRow): AgentRun[] {
  if (!Array.isArray(row.agent_run_rows)) throw invariantError();
  return row.agent_run_rows.map((value) => {
    if (
      !isRecord(value) ||
      !hasExactKeys(value, [
        "run_id",
        "story_id",
        "profile_id",
        "role",
        "operation",
        "outcome",
        "payload",
      ])
    )
      throw invariantError();
    let run: AgentRun;
    try {
      run = decodePostgresAgentRun({
        run_id: value.run_id,
        story_id: value.story_id,
        profile_id: value.profile_id,
        role: value.role,
        operation: value.operation,
        outcome: value.outcome,
        payload: value.payload,
      });
    } catch {
      throw invariantError();
    }
    if (run.storyId !== row.story_id) throw invariantError();
    return run;
  });
}

function decodeArticle(
  row: StoryInspectionRow,
): { readonly article: Article; readonly revisions: ArticleRevision[] } | null {
  const values = [
    row.article_id,
    row.article_story_id,
    row.article_assignment_id,
    row.article_payload,
  ];
  if (values.every((value) => value === null)) {
    if (row.article_revision_rows !== null) throw invariantError();
    return null;
  }
  if (values.some((value) => value === null) || !Array.isArray(row.article_revision_rows))
    throw invariantError();
  try {
    const article = decodePostgresArticle({
      article_id: row.article_id,
      story_id: row.article_story_id,
      assignment_id: row.article_assignment_id,
      payload: row.article_payload,
    });
    if (article.storyId !== row.story_id) throw invariantError();
    const revisions = row.article_revision_rows.map((value) => {
      if (!isRecord(value)) throw invariantError();
      const revision = decodePostgresArticleRevision(value as never);
      if (revision.articleId !== article.id) throw invariantError();
      return revision;
    });
    return { article, revisions };
  } catch {
    throw invariantError();
  }
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
                ), '[]'::jsonb) END AS preparation_payloads,
                assignment.assignment_id,
                assignment.story_id AS assignment_story_id,
                assignment.writer_profile_id,
                assignment.writer_role,
                assignment.payload AS assignment_payload,
                profile.profile_id,
                profile.role AS profile_role,
                profile.built_in AS profile_built_in,
                profile.payload AS profile_payload,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'transition_id', transition.transition_id,
                    'story_id', transition.story_id,
                    'previous_state', transition.previous_state,
                    'next_state', transition.next_state,
                    'revision_cycle', transition.revision_cycle,
                    'payload', transition.payload
                  ) ORDER BY transition.append_position ASC)
                  FROM storyrail.story_transition_receipts AS transition
                  WHERE transition.story_id = story.story_id
                ), '[]'::jsonb) AS transition_rows,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'run_id', run.run_id,
                    'story_id', run.story_id,
                    'profile_id', run.profile_id,
                    'role', run.role,
                    'operation', run.operation,
                    'outcome', run.outcome,
                    'payload', run.payload
                  ) ORDER BY run.append_position ASC)
                  FROM storyrail.agent_runs AS run
                  WHERE run.story_id = story.story_id
                ), '[]'::jsonb) AS agent_run_rows,
                article.article_id,
                article.story_id AS article_story_id,
                article.assignment_id AS article_assignment_id,
                article.payload AS article_payload,
                CASE WHEN article.article_id IS NULL THEN NULL ELSE COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'revision_id', revision.revision_id,
                    'article_id', revision.article_id,
                    'revision_number', revision.revision_number,
                    'writer_profile_id', revision.writer_profile_id,
                    'agent_run_id', revision.agent_run_id,
                    'payload', revision.payload
                  ) ORDER BY revision.revision_number ASC, revision.append_position ASC)
                  FROM storyrail.article_revisions AS revision
                  WHERE revision.article_id = article.article_id
                ), '[]'::jsonb) END AS article_revision_rows
         FROM storyrail.stories AS story
         LEFT JOIN storyrail.story_source_attachments AS attachment
           ON attachment.story_id = story.story_id
         LEFT JOIN storyrail.url_sources AS source
           ON source.source_id = attachment.source_id
         LEFT JOIN storyrail.story_assignments AS assignment
           ON assignment.story_id = story.story_id
         LEFT JOIN storyrail.agent_profiles AS profile
           ON profile.profile_id = assignment.writer_profile_id
         LEFT JOIN storyrail.articles AS article
           ON article.story_id = story.story_id
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
      const assignment = decodeAssignment(firstRow);
      const transitions = decodeTransitions(firstRow);
      const agentRuns = decodeAgentRuns(firstRow);
      const article = decodeArticle(firstRow);
      if (
        article !== null &&
        (assignment === null ||
          article.article.assignmentId !== assignment.assignment.id ||
          article.revisions.length !== 1)
      )
        throw invariantError();
      if (
        article?.revisions.some((revision) => {
          const run = agentRuns.find(({ id }) => id === revision.agentRunId);
          return (
            run?.role !== "writer" ||
            run.outcome !== "succeeded" ||
            run.profileId !== revision.writerProfileId ||
            run.articleId !== article.article.id ||
            run.revisionId !== revision.id
          );
        })
      )
        throw invariantError();
      const seenSourceIds = new Set<SourceId>();

      for (const row of result.rows) {
        const rowStory = decodeStory(row);
        if (!isDeepStrictEqual(rowStory, story)) {
          throw invariantError();
        }
        if (
          !isDeepStrictEqual(decodeAssignment(row), assignment) ||
          !isDeepStrictEqual(decodeTransitions(row), transitions) ||
          !isDeepStrictEqual(decodeAgentRuns(row), agentRuns) ||
          !isDeepStrictEqual(decodeArticle(row), article)
        )
          throw invariantError();

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

      return {
        ok: true,
        inspection: { story, sources, assignment, transitions, agentRuns, article },
      };
    },
  };
}
