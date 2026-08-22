import {
  ARTICLE_BLOCK_KINDS,
  type Article,
  type ArticleBlock,
  type ArticleRevision,
  type ArticleValidationCode,
  type CreateArticleResult,
  type CreateArticleRevisionResult,
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

/**
 * The reading view of a Revision, derived rather than stored. Blocks are the record; rendering
 * them is a presentation concern, so there is no second copy of the prose to drift out of step
 * with the citations attached to it.
 */
export function articleBodyMarkdown(blocks: readonly ArticleBlock[]): string {
  return blocks
    .map((block) => (block.kind === "heading" ? `## ${block.markdown}` : block.markdown))
    .join("\n\n");
}

/**
 * Wraps prose that arrived without any attribution as a single `context` block. It records the
 * truth about such prose — the Writer's own words, supported by nothing the system can check —
 * rather than dressing it up as sourced work.
 */
export function unattributedArticleBlocks(markdown: string): readonly ArticleBlock[] {
  return [{ kind: "context", markdown: markdown.trim(), citations: [] }];
}

function blockProblem(blocks: readonly ArticleBlock[]): ArticleValidationCode | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return "ARTICLE_REVISION_BLOCK_INVALID";
  for (const block of blocks) {
    if (
      !ARTICLE_BLOCK_KINDS.includes(block?.kind) ||
      !nonEmpty(block.markdown) ||
      block.markdown !== block.markdown.trim() ||
      !Array.isArray(block.citations)
    )
      return "ARTICLE_REVISION_BLOCK_INVALID";
    // A claim without a citation is an assertion the system cannot check, and a citation on
    // prose that claims nothing implies support the Writer never offered. Both are refused.
    if (block.kind === "claim" ? block.citations.length === 0 : block.citations.length > 0)
      return "ARTICLE_REVISION_CITATION_INVALID";
    for (const citation of block.citations) {
      if (
        !nonEmpty(citation?.sourceId) ||
        !nonEmpty(citation.evidenceId) ||
        !nonEmpty(citation.quote) ||
        citation.quote !== citation.quote.trim()
      )
        return "ARTICLE_REVISION_CITATION_INVALID";
    }
  }
  return null;
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
  return createArticleRevision(candidate);
}

export function createArticleRevision(candidate: ArticleRevision): CreateArticleRevisionResult {
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
  if (
    !Number.isInteger(candidate.revisionNumber) ||
    candidate.revisionNumber < 1 ||
    candidate.revisionNumber > 3
  ) {
    return invalid(
      "ARTICLE_REVISION_NUMBER_INVALID",
      "Article Revision number must be between 1 and 3.",
    );
  }
  if (!nonEmpty(candidate.headline) || (candidate.dek !== null && !nonEmpty(candidate.dek))) {
    return invalid(
      "ARTICLE_REVISION_CONTENT_INVALID",
      "Article Revision headline must be non-empty; dek must be null or non-empty.",
    );
  }
  const problem = blockProblem(candidate.blocks);
  if (problem !== null) {
    return invalid(
      problem,
      problem === "ARTICLE_REVISION_BLOCK_INVALID"
        ? "An Article Revision must be a non-empty list of blocks with trimmed Markdown."
        : "A claim block must carry at least one complete citation, and other blocks none.",
    );
  }
  if (
    candidate.createdBy.type !== "agent" ||
    candidate.createdBy.role !== "writer" ||
    candidate.createdBy.runId !== candidate.agentRunId
  ) {
    return invalid(
      "ARTICLE_REVISION_AUTHOR_INVALID",
      "An Article Revision must be authored by its Writer AgentRun.",
    );
  }
  return {
    ok: true,
    revision: structuredClone({
      ...candidate,
      headline: candidate.headline.trim(),
      dek: candidate.dek === null ? null : candidate.dek.trim(),
    }),
  };
}
