import { describe, expect, it } from "vitest";
import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  articleBodyMarkdown,
  createArticle,
  createArticleRevision,
  createFirstArticleRevision,
  sourceEvidencePreparationId,
  sourceId,
  storyId,
  unattributedArticleBlocks,
  type ArticleBlock,
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
      blocks: [{ kind: "context" as const, markdown: "Body", citations: [] }],
      createdBy: { type: "agent", role: "writer", runId },
      createdAt: "now",
    });
    expect(result).toEqual({
      ok: true,
      revision: expect.objectContaining({
        revisionNumber: 1,
        headline: "Headline",
        blocks: [{ kind: "context", markdown: "Body", citations: [] }],
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
      blocks: [{ kind: "context" as const, markdown: "Revised body.", citations: [] }],
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

describe("Article Revision blocks", () => {
  const runId = agentRunId("run-55");
  const cited: ArticleBlock = {
    kind: "claim",
    markdown: "Rust 2024 is the largest edition released to date.",
    citations: [
      {
        sourceId: sourceId("source-55"),
        evidenceId: sourceEvidencePreparationId("preparation-55"),
        quote: "Rust 2024 marks the largest edition released to date",
      },
    ],
  };
  const revision = (blocks: readonly ArticleBlock[]) =>
    createArticleRevision({
      id: articleRevisionId("revision-55"),
      articleId: articleId("article-55"),
      revisionNumber: 1,
      writerProfileId: agentProfileId("writer-55"),
      agentRunId: runId,
      headline: "Headline",
      dek: null,
      blocks,
      createdBy: { type: "agent", role: "writer", runId },
      createdAt: "now",
    });

  it("accepts a claim that says where it came from", () => {
    expect(revision([cited])).toMatchObject({ ok: true });
  });

  it("refuses a claim that cites nothing", () => {
    // The whole point of the kind is that a claim can be checked. One that cites nothing
    // cannot be, so it must not be recordable as a claim.
    expect(revision([{ ...cited, citations: [] }])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_CITATION_INVALID" },
    });
  });

  it("refuses attribution on prose that claims nothing", () => {
    expect(revision([{ ...cited, kind: "context" }])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_CITATION_INVALID" },
    });
    expect(revision([{ ...cited, kind: "heading" }])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_CITATION_INVALID" },
    });
  });

  it("refuses an incomplete citation", () => {
    for (const broken of [
      { ...cited.citations[0], quote: "  " },
      { ...cited.citations[0], quote: " padded " },
      { ...cited.citations[0], evidenceId: "" },
      { ...cited.citations[0], sourceId: "" },
    ]) {
      expect(revision([{ ...cited, citations: [broken as never] }])).toMatchObject({
        ok: false,
        error: { code: "ARTICLE_REVISION_CITATION_INVALID" },
      });
    }
  });

  it("refuses an empty or malformed block list", () => {
    expect(revision([])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_BLOCK_INVALID" },
    });
    expect(revision([{ kind: "context", markdown: "  ", citations: [] }])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_BLOCK_INVALID" },
    });
    expect(revision([{ kind: "context", markdown: " padded ", citations: [] }])).toMatchObject({
      ok: false,
      error: { code: "ARTICLE_REVISION_BLOCK_INVALID" },
    });
    expect(
      revision([{ kind: "footnote", markdown: "Text", citations: [] } as never]),
    ).toMatchObject({ ok: false, error: { code: "ARTICLE_REVISION_BLOCK_INVALID" } });
  });

  it("renders blocks for reading without storing a second copy of the prose", () => {
    expect(
      articleBodyMarkdown([
        { kind: "heading", markdown: "What happened", citations: [] },
        cited,
        { kind: "context", markdown: "The release lands as expected.", citations: [] },
      ]),
    ).toBe(
      "## What happened\n\nRust 2024 is the largest edition released to date.\n\nThe release lands as expected.",
    );
  });

  it("records prose that arrived without attribution as exactly that", () => {
    // Nothing about this prose has been verified, and the record says so rather than implying
    // a source it never had.
    expect(unattributedArticleBlocks("  Body copy.  ")).toEqual([
      { kind: "context", markdown: "Body copy.", citations: [] },
    ]);
  });
});
