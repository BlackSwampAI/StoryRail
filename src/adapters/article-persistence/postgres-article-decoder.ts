import { z } from "zod";

import {
  createArticle,
  createArticleRevision,
  type Article,
  type ArticleRevision,
} from "@/domain/editorial";

const nonEmpty = z.string().refine((value) => value.trim().length > 0 && value === value.trim());
const articleSchema = z
  .object({ id: nonEmpty, storyId: nonEmpty, assignmentId: nonEmpty, createdAt: nonEmpty })
  .strict();
const revisionSchema = z
  .object({
    id: nonEmpty,
    articleId: nonEmpty,
    revisionNumber: z.number().int().min(1).max(3),
    writerProfileId: nonEmpty,
    agentRunId: nonEmpty,
    headline: nonEmpty,
    dek: nonEmpty.nullable(),
    bodyMarkdown: nonEmpty,
    createdBy: z
      .object({ type: z.literal("agent"), role: z.literal("writer"), runId: nonEmpty })
      .strict(),
    createdAt: nonEmpty,
  })
  .strict();

export class PostgresArticleInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned invalid or impossible persisted Article state.");
    this.name = "PostgresArticleInvariantError";
  }
}

export function decodePostgresArticle(row: {
  article_id: unknown;
  story_id: unknown;
  assignment_id: unknown;
  payload: unknown;
}): Article {
  const parsed = articleSchema.safeParse(row.payload);
  if (
    !parsed.success ||
    parsed.data.id !== row.article_id ||
    parsed.data.storyId !== row.story_id ||
    parsed.data.assignmentId !== row.assignment_id
  )
    throw new PostgresArticleInvariantError();
  const created = createArticle(parsed.data as Article);
  if (!created.ok) throw new PostgresArticleInvariantError();
  return created.article;
}

export function decodePostgresArticleRevision(row: {
  revision_id: unknown;
  article_id: unknown;
  revision_number: unknown;
  writer_profile_id: unknown;
  agent_run_id: unknown;
  payload: unknown;
}): ArticleRevision {
  const parsed = revisionSchema.safeParse(row.payload);
  if (
    !parsed.success ||
    parsed.data.id !== row.revision_id ||
    parsed.data.articleId !== row.article_id ||
    parsed.data.revisionNumber !== row.revision_number ||
    parsed.data.writerProfileId !== row.writer_profile_id ||
    parsed.data.agentRunId !== row.agent_run_id
  )
    throw new PostgresArticleInvariantError();
  const created = createArticleRevision(parsed.data as ArticleRevision);
  if (!created.ok) throw new PostgresArticleInvariantError();
  return created.revision;
}
