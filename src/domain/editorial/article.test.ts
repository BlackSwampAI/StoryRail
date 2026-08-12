import { describe, expect, it } from "vitest";
import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  createArticle,
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
});
