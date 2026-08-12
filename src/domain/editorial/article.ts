import type {
  Article,
  ArticleRevision,
  ArticleValidationCode,
  CreateArticleResult,
  CreateArticleRevisionResult,
} from "./article-types";

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function invalid<T extends CreateArticleResult | CreateArticleRevisionResult>(
  code: ArticleValidationCode,
  message: string,
): T {
  return { ok: false, error: { code, message } } as T;
}

export function createArticle(candidate: Article): CreateArticleResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.storyId) ||
    !nonEmpty(candidate.assignmentId) ||
    !nonEmpty(candidate.createdAt)
  ) {
    return invalid(
      "ARTICLE_IDENTITY_INVALID",
      "Article identities and creation time must be non-empty.",
    );
  }
  return { ok: true, article: structuredClone(candidate) };
}

export function createFirstArticleRevision(
  candidate: ArticleRevision,
): CreateArticleRevisionResult {
  if (
    !nonEmpty(candidate.id) ||
    !nonEmpty(candidate.articleId) ||
    !nonEmpty(candidate.writerProfileId) ||
    !nonEmpty(candidate.agentRunId) ||
    !nonEmpty(candidate.createdAt)
  ) {
    return invalid(
      "ARTICLE_IDENTITY_INVALID",
      "Article Revision identities and creation time must be non-empty.",
    );
  }
  if (candidate.revisionNumber !== 1) {
    return invalid(
      "ARTICLE_REVISION_NUMBER_INVALID",
      "The first Article Revision number must be 1.",
    );
  }
  if (
    !nonEmpty(candidate.headline) ||
    (candidate.dek !== null && !nonEmpty(candidate.dek)) ||
    !nonEmpty(candidate.bodyMarkdown)
  ) {
    return invalid(
      "ARTICLE_REVISION_CONTENT_INVALID",
      "Article Revision headline and body must be non-empty; dek must be null or non-empty.",
    );
  }
  if (
    candidate.createdBy.type !== "agent" ||
    candidate.createdBy.role !== "writer" ||
    candidate.createdBy.runId !== candidate.agentRunId
  ) {
    return invalid(
      "ARTICLE_REVISION_AUTHOR_INVALID",
      "The first Article Revision must be authored by its Writer AgentRun.",
    );
  }
  return {
    ok: true,
    revision: structuredClone({
      ...candidate,
      headline: candidate.headline.trim(),
      dek: candidate.dek === null ? null : candidate.dek.trim(),
      bodyMarkdown: candidate.bodyMarkdown.trim(),
    }),
  };
}
