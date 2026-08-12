import { describe, expect, it } from "vitest";
import { decodePostgresArticle, decodePostgresArticleRevision } from "./postgres-article-decoder";

describe("PostgreSQL Article decoders", () => {
  it("strictly reconstructs an Article and immutable Revision 1", () => {
    const article = {
      id: "article-31",
      storyId: "story-31",
      assignmentId: "assignment-31",
      createdAt: "created",
    };
    const revision = {
      id: "revision-31",
      articleId: article.id,
      revisionNumber: 1 as const,
      writerProfileId: "writer-31",
      agentRunId: "run-31",
      headline: "Headline",
      dek: null,
      bodyMarkdown: "Body",
      createdBy: { type: "agent" as const, role: "writer" as const, runId: "run-31" },
      createdAt: "created",
    };
    expect(
      decodePostgresArticle({
        article_id: article.id,
        story_id: article.storyId,
        assignment_id: article.assignmentId,
        payload: article,
      }),
    ).toEqual(article);
    expect(
      decodePostgresArticleRevision({
        revision_id: revision.id,
        article_id: revision.articleId,
        revision_number: 1,
        writer_profile_id: revision.writerProfileId,
        agent_run_id: revision.agentRunId,
        payload: revision,
      }),
    ).toEqual(revision);
  });
  it("rejects relational disagreement and unknown properties", () => {
    const article = {
      id: "article-31",
      storyId: "story-31",
      assignmentId: "assignment-31",
      createdAt: "created",
      extra: true,
    };
    expect(() =>
      decodePostgresArticle({
        article_id: "article-31",
        story_id: "story-31",
        assignment_id: "assignment-31",
        payload: article,
      }),
    ).toThrowError(expect.objectContaining({ name: "PostgresArticleInvariantError" }));
  });
});
