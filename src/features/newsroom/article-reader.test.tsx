import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  agentProfileId,
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

    const toggle = screen.getByRole("button", { name: /show 1 source/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /hide 1 source/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // The passage relied on, and a link a reader can follow to check it themselves.
    expect(screen.getByText("The release shipped on Tuesday")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Announcing the release" });
    expect(link).toHaveAttribute("href", "https://blog.example.test/release");
    expect(screen.getByText(/prepared evidence/)).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /show 1 source/i }));
    expect(screen.getByText("Source unavailable on this Story")).toBeInTheDocument();
    expect(screen.getByText(/evidence record not found/)).toBeInTheDocument();
  });
});
