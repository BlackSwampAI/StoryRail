import { describe, expect, it } from "vitest";

import { describePriorReport, priorReportExcerpt } from "./archive";
import type { PriorReport } from "./archive-types";
import type { ArticleBlock } from "./article-types";
import { articleRevisionId, sourceId, storyId } from "./types";

function block(markdown: string, kind: ArticleBlock["kind"] = "context"): ArticleBlock {
  return {
    kind,
    markdown,
    citations:
      kind === "claim"
        ? [{ sourceId: sourceId("source-1"), evidenceId: "evidence-1" as never, quote: markdown }]
        : [],
  };
}

const REPORT: PriorReport = {
  storyId: storyId("story-archive"),
  revisionId: articleRevisionId("revision-archive"),
  revisionNumber: 2,
  headline: "The compiler team shipped inline const expressions",
  dek: "What it changes for people writing generic code.",
  publishedAt: "2026-03-04T10:00:00.000Z",
  blocks: [block("Opening paragraph."), block("Second paragraph.")],
  sources: [
    { sourceId: sourceId("source-1"), url: "https://example.test/a", relevance: "The release." },
    { sourceId: sourceId("source-2"), url: "https://example.test/b", relevance: "The RFC." },
  ],
};

describe("prior report excerpt", () => {
  it("keeps whole paragraphs that fit within the limit", () => {
    expect(priorReportExcerpt([block("One."), block("Two."), block("Three.")], 12)).toBe(
      "One.\n\nTwo.",
    );
  });

  it("renders a heading as the reading view does", () => {
    expect(priorReportExcerpt([block("Background", "heading"), block("Prose.")])).toBe(
      "## Background\n\nProse.",
    );
  });

  it("never returns a paragraph joined to one that followed it", () => {
    const excerpt = priorReportExcerpt([block("First."), block("Second.")], 10);
    expect(excerpt).toBe("First.");
    expect(excerpt).not.toContain("Second");
  });

  it("cuts an over-long opening at a word boundary and marks it as cut", () => {
    const excerpt = priorReportExcerpt([block("alpha beta gamma delta")], 12);
    expect(excerpt).toBe("alpha beta…");
  });

  it("returns nothing for no blocks rather than throwing", () => {
    expect(priorReportExcerpt([])).toBe("");
  });
});

describe("describing a prior report to an agent", () => {
  it("names the Story, the time it was published, and the Sources behind it", () => {
    const described = describePriorReport(REPORT);

    expect(described).toContain('StoryRail published "The compiler team shipped inline const');
    expect(described).toContain("Story story-archive, revision 2");
    expect(described).toContain("2026-03-04T10:00:00.000Z");
    expect(described).toContain("https://example.test/a, https://example.test/b");
    expect(described).toContain("Opening paragraph.");
  });

  it("says so when no Sources are recorded behind the earlier reporting", () => {
    expect(describePriorReport({ ...REPORT, sources: [] })).toContain(
      "No Sources are recorded behind it.",
    );
  });

  it("omits an absent dek rather than describing it as empty", () => {
    expect(describePriorReport({ ...REPORT, dek: null })).not.toContain("null");
  });

  it("carries no evidence identifier a claim could be hung on", () => {
    expect(describePriorReport(REPORT)).not.toContain("evidenceId");
  });
});
