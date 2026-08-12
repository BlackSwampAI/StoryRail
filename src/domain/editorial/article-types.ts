import type {
  AgentProfileId,
  AgentRunId,
  ArticleId,
  ArticleRevisionId,
  AssignmentId,
  EditorialActor,
  StoryId,
} from "./types";

export interface Article {
  readonly id: ArticleId;
  readonly storyId: StoryId;
  readonly assignmentId: AssignmentId;
  readonly createdAt: string;
}

export interface ArticleRevision {
  readonly id: ArticleRevisionId;
  readonly articleId: ArticleId;
  readonly revisionNumber: 1;
  readonly writerProfileId: AgentProfileId;
  readonly agentRunId: AgentRunId;
  readonly headline: string;
  readonly dek: string | null;
  readonly bodyMarkdown: string;
  readonly createdBy: EditorialActor;
  readonly createdAt: string;
}

export type ArticleValidationCode =
  | "ARTICLE_IDENTITY_INVALID"
  | "ARTICLE_REVISION_NUMBER_INVALID"
  | "ARTICLE_REVISION_CONTENT_INVALID"
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
