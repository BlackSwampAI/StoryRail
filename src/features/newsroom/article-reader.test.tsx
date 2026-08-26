import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  articleBodyMarkdown,
  agentRunId,
  articleId,
  articleRevisionId,
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  type ArticleRevision,
} from "@/domain/editorial";

import { ArticleReader } from "./article-reader";
import styles from "./newsroom-shell.module.css";

const SOURCE = sourceId("source-reader");
const PREPARED = sourceEvidencePreparationId("prepared-reader");
const RUN = agentRunId("run-reader");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-reader") };

const inspection = {
  sources: [
    {
      attachment: {
        storyId: storyId("story-reader"),
        sourceId: SOURCE,
        relevance: "Primary",
        attachedBy: OPERATOR,
        attachedAt: "attached",
      },
      source: {
        id: SOURCE,
        type: "url" as const,
        submittedUrl: "https://blog.example.test/release",
        canonicalUrl: "https://blog.example.test/release" as never,
        submittedBy: OPERATOR,
        receivedAt: "received",
      },
      extractions: [],
      preparations: [
        {
          id: PREPARED,
          sourceId: SOURCE,
          extractionId: sourceExtractionId("raw-reader"),
          model: { provider: "openrouter", model: "prep" },
          preparer: { key: "prep", version: "1" },
          input: { rawCharacters: 40, submittedCharacters: 40 },
          requestedBy: OPERATOR,
          startedAt: "start",
          completedAt: "end",
          outcome: "succeeded" as const,
          document: {
            format: "markdown" as const,
            content: "The release shipped on Tuesday.",
            title: "Announcing the release",
            byline: null,
            publishedAt: null,
            language: null,
          },
        },
      ],
    },
  ],
};

const revision: ArticleRevision = {
  id: articleRevisionId("revision-reader"),
  articleId: articleId("article-reader"),
  revisionNumber: 1,
  writerProfileId: agentProfileId("writer-reader"),
  agentRunId: RUN,
  headline: "The release is out",
  dek: null,
  blocks: [
    { kind: "heading", markdown: "What happened", citations: [] },
    {
      kind: "claim",
      markdown: "The release shipped on Tuesday.",
      citations: [
        { sourceId: SOURCE, evidenceId: PREPARED, quote: "The release shipped on Tuesday" },
      ],
    },
    { kind: "context", markdown: "Adoption will take time.", citations: [] },
  ],
  createdBy: { type: "agent", role: "writer", runId: RUN },
  createdAt: "drafted",
};

const measurement = {
  claimBlocks: 1,
  contextBlocks: 1,
  headingBlocks: 1,
  citations: 1,
  groundedShare: 0.5,
  derivedShare: 0.1,
};

const renderReader = () =>
  render(
    <ArticleReader
      revision={revision}
      writerName="General Writer"
      headingId="heading"
      measurement={measurement}
      inspection={inspection}
    />,
  );

describe("reading an Article with its support attached", () => {
  it("keeps a claim's support one click away rather than on the page", () => {
    renderReader();
    expect(screen.queryByText(/The release shipped on Tuesday$/)).not.toBeInTheDocument();

    const mark = screen.getByRole("button", { name: /attributed · 1 source/i });
    expect(mark).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mark);

    expect(screen.getByRole("button", { name: /attributed · 1 source/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // The passage relied on, and a link a reader can follow to check it themselves.
    expect(screen.getByText("The release shipped on Tuesday")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Announcing the release" });
    expect(link).toHaveAttribute("href", "https://blog.example.test/release");
    expect(screen.getByText(/prepared evidence/)).toBeInTheDocument();
  });

  // A filled button per paragraph stacked down the whole piece and drowned the prose it was
  // annotating. The grounding still has to be visible, so the mark is quietened, not removed.
  it("marks a claim's attribution as quietly as it marks unattributed prose", () => {
    renderReader();

    const mark = screen.getByRole("button", { name: /attributed · 1 source/i });
    expect(mark.className).toBe(styles.claimMark);
    expect(screen.queryByRole("button", { name: /^show 1 source$/i })).not.toBeInTheDocument();
    fireEvent.click(mark);
    expect(screen.getByText("The release shipped on Tuesday")).toBeInTheDocument();
  });

  it("labels uncited prose instead of letting it pass as reporting", () => {
    renderReader();
    expect(screen.getByText("Adoption will take time.")).toBeInTheDocument();
    expect(screen.getByText(/Writer's own framing · not attributed/)).toBeInTheDocument();
  });

  it("renders headings without offering support they do not have", () => {
    renderReader();
    expect(screen.getByRole("heading", { name: "What happened", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /source/i })).toHaveLength(1);
  });

  it("opens annotated, because reading the piece as prose is the deliberate act", () => {
    renderReader();
    expect(screen.getByRole("button", { name: "Annotated" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Plain text" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: /attributed · 1 source/i })).toBeInTheDocument();
  });

  it("shows the article's own derived text rather than a second rendering of it", () => {
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Plain text" }));

    expect(
      screen.getByText(articleBodyMarkdown(revision.blocks), { collapseWhitespace: false }),
    ).toBeInTheDocument();
    // The attributions are what the operator asked to be able to read past.
    expect(
      screen.queryByRole("button", { name: /attributed · 1 source/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Writer's own framing/)).not.toBeInTheDocument();
  });

  it("shows the Revision it was given rather than whichever is newest", () => {
    // A Story holds up to three Revisions; a later one existing must not change what is read.
    const secondRevision: ArticleRevision = {
      ...revision,
      id: articleRevisionId("revision-reader-2"),
      revisionNumber: 2,
      headline: "The release is out, revised",
      blocks: [{ kind: "context", markdown: "A later thought entirely.", citations: [] }],
    };
    expect(secondRevision.revisionNumber).toBe(2);
    render(
      <ArticleReader
        revision={revision}
        writerName="General Writer"
        headingId="heading"
        measurement={measurement}
        inspection={inspection}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Plain text" }));

    expect(screen.getByRole("heading", { name: "The release is out" })).toBeInTheDocument();
    expect(
      screen.getByText(articleBodyMarkdown(revision.blocks), { collapseWhitespace: false }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/A later thought/)).not.toBeInTheDocument();
  });

  it("offers the article text to the clipboard so it need not be selected by hand", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Plain text" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy article text" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(articleBodyMarkdown(revision.blocks)),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Copied the article text.");
  });

  it("says the clipboard was refused rather than implying the copy took", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
      configurable: true,
    });
    renderReader();
    fireEvent.click(screen.getByRole("button", { name: "Plain text" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy article text" }));

    expect(await screen.findByRole("status")).toHaveTextContent(/clipboard is unavailable/i);
  });

  it("marks the Writer's unattributed prose and leaves an attributed claim unmarked", () => {
    renderReader();
    const marks = screen.getAllByText(/Writer's own framing · not attributed/);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.previousSibling).toHaveTextContent("Adoption will take time.");
  });

  it("says when a citation cannot be resolved rather than hiding it", () => {
    render(
      <ArticleReader
        revision={{
          ...revision,
          blocks: [
            {
              kind: "claim",
              markdown: "An orphaned claim.",
              citations: [
                {
                  sourceId: sourceId("detached"),
                  evidenceId: sourceEvidencePreparationId("detached"),
                  quote: "Nowhere to be found",
                },
              ],
            },
          ],
        }}
        writerName="General Writer"
        headingId="heading"
        measurement={measurement}
        inspection={inspection}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /attributed · 1 source/i }));
    expect(screen.getByText("Source unavailable on this Story")).toBeInTheDocument();
    expect(screen.getByText(/evidence record not found/)).toBeInTheDocument();
  });
});
