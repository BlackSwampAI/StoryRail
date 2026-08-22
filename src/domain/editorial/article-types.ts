import type {
  AgentProfileId,
  AgentRunId,
  ArticleId,
  ArticleRevisionId,
  AssignmentId,
  EditorialActor,
  SourceEvidencePreparationId,
  SourceExtractionId,
  SourceId,
  StoryId,
} from "./types";

export interface Article {
  readonly id: ArticleId;
  readonly storyId: StoryId;
  readonly assignmentId: AssignmentId;
  readonly createdAt: string;
}

/**
 * A block declares what kind of sentence it is, which is the point of the structure. A `claim`
 * asserts something drawn from the evidence and must say where; `context` is the Writer's own
 * connective prose and must not pretend to a source it does not have. Keeping the two apart is
 * what lets a reader — and later a measurement — tell grounded work from fluent work.
 */
export const ARTICLE_BLOCK_KINDS = ["heading", "claim", "context"] as const;
export type ArticleBlockKind = (typeof ARTICLE_BLOCK_KINDS)[number];

/**
 * Where a claim came from: the Source, the exact evidence record read, and the passage relied
 * on. The quote is stored verbatim so that support can be checked against the evidence rather
 * than taken on trust.
 */
export interface ArticleCitation {
  readonly sourceId: SourceId;
  readonly evidenceId: SourceEvidencePreparationId | SourceExtractionId;
  readonly quote: string;
}

export interface ArticleBlock {
  readonly kind: ArticleBlockKind;
  readonly markdown: string;
  readonly citations: readonly ArticleCitation[];
}

export interface ArticleRevision {
  readonly id: ArticleRevisionId;
  readonly articleId: ArticleId;
  readonly revisionNumber: 1 | 2 | 3;
  readonly writerProfileId: AgentProfileId;
  readonly agentRunId: AgentRunId;
  readonly headline: string;
  readonly dek: string | null;
  readonly blocks: readonly ArticleBlock[];
  readonly createdBy: EditorialActor;
  readonly createdAt: string;
}

export type ArticleValidationCode =
  | "ARTICLE_IDENTITY_INVALID"
  | "ARTICLE_REVISION_NUMBER_INVALID"
  | "ARTICLE_REVISION_CONTENT_INVALID"
  | "ARTICLE_REVISION_BLOCK_INVALID"
  | "ARTICLE_REVISION_CITATION_INVALID"
  | "ARTICLE_REVISION_AUTHOR_INVALID";

export type CreateArticleResult =
  | { readonly ok: true; readonly article: Article }
  | {
      readonly ok: false;
      readonly error: { readonly code: ArticleValidationCode; readonly message: string };
    };

export type CreateArticleRevisionResult =
  | { readonly ok: true; readonly revision: ArticleRevision }
  | {
      readonly ok: false;
      readonly error: { readonly code: ArticleValidationCode; readonly message: string };
    };
