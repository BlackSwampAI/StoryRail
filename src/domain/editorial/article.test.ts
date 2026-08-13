import { describe, expect, it } from "vitest";
import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  createArticle,
  createArticleRevision,
  createFirstArticleRevision,
  storyId,
} from ".";

describe("Article domain", () => {
  it("creates a durable Article tied to a Story and Assignment", () => {
    expect(
      createArticle({
        id: articleId("article-31"),
        storyId: storyId("story-31"),
        assignmentId: assignmentId("assignment-31"),
        createdAt: "2026-08-12T12:00:00.000Z",
      }),
    ).toMatchObject({ ok: true });
  });

  it("requires immutable Revision 1 content and Writer AgentRun authorship", () => {
    const runId = agentRunId("run-31");
    const result = createFirstArticleRevision({
      id: articleRevisionId("revision-31"),
      articleId: articleId("article-31"),
      revisionNumber: 1,
      writerProfileId: agentProfileId("writer-31"),
      agentRunId: runId,
      headline: " Headline ",
      dek: null,
      bodyMarkdown: " Body ",
      createdBy: { type: "agent", role: "writer", runId },
      createdAt: "now",
    });
    expect(result).toEqual({
      ok: true,
      revision: expect.objectContaining({
        revisionNumber: 1,
        headline: "Headline",
        bodyMarkdown: "Body",
      }),
    });
  });

  it("rejects empty content and non-Writer authorship", () => {
    const runId = agentRunId("run-31");
    expect(
      createFirstArticleRevision({
        id: articleRevisionId("revision-31"),
        articleId: articleId("article-31"),
        revisionNumber: 1,
        writerProfileId: agentProfileId("writer-31"),
        agentRunId: runId,
        headline: " ",
        dek: " ",
        bodyMarkdown: "",
        createdBy: { type: "agent", role: "assignment_editor", runId },
        createdAt: "now",
      } as never),
    ).toMatchObject({ ok: false });
  });

  it("accepts bounded immutable revisions 2 and 3 but rejects revision 4", () => {
    const runId = agentRunId("run-revision");
    const candidate = {
      id: articleRevisionId("revision-next"),
      articleId: articleId("article-31"),
      revisionNumber: 2 as const,
      writerProfileId: agentProfileId("writer-31"),
      agentRunId: runId,
      headline: "Revised headline",
      dek: null,
      bodyMarkdown: "Revised body.",
      createdBy: { type: "agent" as const, role: "writer" as const, runId },
      createdAt: "now",
    };
    expect(createArticleRevision(candidate)).toMatchObject({
      ok: true,
      revision: { revisionNumber: 2 },
    });
    expect(createArticleRevision({ ...candidate, revisionNumber: 3 })).toMatchObject({ ok: true });
    expect(createArticleRevision({ ...candidate, revisionNumber: 4 } as never)).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_NUMBER_INVALID" },
    });
  });
});
