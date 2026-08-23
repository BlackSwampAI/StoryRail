import { describe, expect, it, vi } from "vitest";

import { articleRevisionId, sourceId, storyId, type PriorReport } from "@/domain/editorial";

import { createSearchArchiveTool } from "./search-archive-tool";

function report(overrides: Partial<PriorReport> = {}): PriorReport {
  return {
    storyId: storyId("story-march"),
    revisionId: articleRevisionId("revision-march"),
    revisionNumber: 1,
    headline: "Inline const expressions reached stable",
    dek: null,
    publishedAt: "2026-03-04T10:00:00.000Z",
    blocks: [{ kind: "context", markdown: "The release landed in March.", citations: [] }],
    sources: [
      { sourceId: sourceId("source-1"), url: "https://example.test/a", relevance: "The release." },
    ],
    ...overrides,
  };
}

function toolFor(found: readonly PriorReport[], excludeStoryId = storyId("story-now")) {
  const search = vi.fn(async () => found);
  return { search, tool: createSearchArchiveTool({ archive: { search }, excludeStoryId }) };
}

describe("search_archive tool", () => {
  it("declares an open-text query and nothing else", () => {
    const { tool } = toolFor([]);

    expect(tool.declaration.name).toBe("search_archive");
    expect(tool.declaration.parameters).toMatchObject({
      required: ["query"],
      additionalProperties: false,
    });
  });

  it("searches with the working Story excluded so a run cannot find itself", async () => {
    const { search, tool } = toolFor([report()]);

    await tool.execute({ query: "  inline const  " });

    expect(search).toHaveBeenCalledWith({
      terms: "inline const",
      limit: 5,
      excludeStoryId: storyId("story-now"),
    });
  });

  it("hands back the prior reporting and says it may not be cited", async () => {
    const { tool } = toolFor([report()]);

    const result = await tool.execute({ query: "inline const" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("prior reporting, not evidence");
    expect(result.content).toContain("Inline const expressions reached stable");
    expect(result.content).toContain("https://example.test/a");
  });

  it("records what was asked and what it matched, not a copy of the reporting", async () => {
    const { tool } = toolFor([report()]);

    const result = await tool.execute({ query: "inline const" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.record).toEqual({
      query: "inline const",
      matched: 1,
      storyIds: ["story-march"],
    });
    expect(JSON.stringify(result.record)).not.toContain("The release landed in March.");
  });

  it("reports an uncovered subject as an answer rather than a failure", async () => {
    const { tool } = toolFor([]);

    const result = await tool.execute({ query: "something new" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("has not covered it");
    expect(result.record).toMatchObject({ matched: 0, storyIds: [] });
  });

  it.each([["   "], [""], [42], [null]])("refuses %p as a query", async (query) => {
    const { search, tool } = toolFor([]);

    await expect(tool.execute({ query: query as never })).resolves.toMatchObject({
      ok: false,
      failure: { code: "TOOL_REQUEST_INVALID", retryable: false },
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("separates several reports so they cannot read as one", async () => {
    const { tool } = toolFor([
      report(),
      report({ storyId: storyId("story-april"), headline: "A later report" }),
    ]);

    const result = await tool.execute({ query: "const" });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.content).toContain("\n\n---\n\n");
    expect(result.record).toMatchObject({ storyIds: ["story-march", "story-april"] });
  });
});
