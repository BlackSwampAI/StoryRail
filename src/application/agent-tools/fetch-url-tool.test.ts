import { describe, expect, it, vi } from "vitest";

import type { SourceExtractor } from "@/adapters/source-extraction";

import { createFetchUrlTool } from "./fetch-url-tool";

const document = {
  format: "markdown" as const,
  content: "The release shipped on Tuesday.",
  title: "Announcing the release",
  byline: null,
  publishedAt: null,
  language: null,
};

const tool = (extract: SourceExtractor["extract"], contentLimit?: number) =>
  createFetchUrlTool({
    extractor: { descriptor: { key: "test", version: "1" }, extract } as SourceExtractor,
    createSourceId: () => "source-tool",
    now: () => "now",
    contentLimit,
  });

describe("the fetch tool", () => {
  it("retrieves a page and keeps the audit record small", async () => {
    const result = await tool(vi.fn(async () => ({ ok: true as const, document }))).execute({
      url: "https://example.test/post",
    });

    expect(result).toMatchObject({
      ok: true,
      record: { url: "https://example.test/post", title: "Announcing the release", characters: 31 },
    });
    expect(result.ok && result.content).toContain("The release shipped on Tuesday.");
  });

  it("refuses anything but a web address, in the tool rather than the prompt", async () => {
    const extract = vi.fn();
    for (const url of ["file:///etc/passwd", "ftp://example.test", "not a url", ""]) {
      const result = await tool(extract as never).execute({ url });
      expect(result.ok).toBe(false);
    }
    // A model cannot talk the tool into reading a local file by asking nicely.
    expect(extract).not.toHaveBeenCalled();
  });

  it("reports an extraction failure as a tool failure rather than empty content", async () => {
    const result = await tool(
      vi.fn(async () => ({
        ok: false as const,
        failure: { code: "SOURCE_EXTRACTION_FAILED" as never, retryable: true, message: "no" },
      })),
    ).execute({ url: "https://example.test" });

    expect(result).toMatchObject({ ok: false, failure: { code: "TOOL_EXECUTION_FAILED" } });
  });

  it("truncates long pages and says that it did", async () => {
    const long = { ...document, content: "x".repeat(500) };
    const result = await tool(
      vi.fn(async () => ({ ok: true as const, document: long })),
      100,
    ).execute({ url: "https://example.test" });

    expect(result).toMatchObject({ ok: true, record: { characters: 500, truncated: true } });
  });
});
