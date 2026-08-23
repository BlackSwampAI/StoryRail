// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { storyId } from "@/domain/editorial";

import { createPostgresArchiveRepository } from "./postgres-archive-repository";

const REVISION = {
  id: "revision-archive",
  articleId: "article-archive",
  revisionNumber: 1,
  writerProfileId: "profile-writer",
  agentRunId: "run-writer",
  headline: "Inline const expressions reached stable",
  dek: null,
  blocks: [{ kind: "context", markdown: "The release landed in March.", citations: [] }],
  createdBy: { type: "agent", role: "writer", runId: "run-writer" },
  createdAt: "created",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    story_id: "story-march",
    published_at: "2026-03-04T10:00:00.000Z",
    article_id: REVISION.articleId,
    revision_id: REVISION.id,
    revision_number: REVISION.revisionNumber,
    writer_profile_id: REVISION.writerProfileId,
    agent_run_id: REVISION.agentRunId,
    payload: REVISION,
    sources: [{ sourceId: "source-1", url: "https://example.test/a", relevance: "The release." }],
    ...overrides,
  };
}

function repositoryFor(rows: readonly Record<string, unknown>[]) {
  const query = vi.fn(async (_sql: string, _values: readonly unknown[]) => ({ rows }));
  return {
    query,
    repository: createPostgresArchiveRepository({ pool: { query } as unknown as Pool }),
  };
}

describe("createPostgresArchiveRepository", () => {
  it("returns the latest Revision of matching published Stories with the Sources behind them", async () => {
    const { repository } = repositoryFor([row()]);

    await expect(
      repository.search({ terms: "inline const", limit: 5, excludeStoryId: null }),
    ).resolves.toEqual([
      {
        storyId: "story-march",
        revisionId: REVISION.id,
        revisionNumber: 1,
        headline: REVISION.headline,
        dek: null,
        publishedAt: "2026-03-04T10:00:00.000Z",
        blocks: REVISION.blocks,
        sources: [
          { sourceId: "source-1", url: "https://example.test/a", relevance: "The release." },
        ],
      },
    ]);
  });

  it("passes the agent's words as a search phrase rather than as query syntax", async () => {
    const { query, repository } = repositoryFor([]);

    await repository.search({
      terms: "inline & const | anything",
      limit: 5,
      excludeStoryId: storyId("story-now"),
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("websearch_to_tsquery"), [
      "inline & const | anything",
      "story-now",
      5,
    ]);
    expect(query.mock.calls[0]?.[0]).toContain("story.state = 'published'");
  });

  it("holds the result ceiling itself rather than trusting the caller's limit", async () => {
    const { query, repository } = repositoryFor([]);

    await repository.search({ terms: "anything", limit: 500, excludeStoryId: null });

    expect(query.mock.calls[0]?.[1]).toEqual(["anything", null, 5]);
  });

  it("does not reach the database for an empty query", async () => {
    const { query, repository } = repositoryFor([]);

    await expect(
      repository.search({ terms: "  ", limit: 5, excludeStoryId: null }),
    ).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([
    ["a published Story with no publication time", row({ published_at: null })],
    ["a Revision whose payload contradicts its row", row({ revision_id: "elsewhere" })],
    ["Sources that are not a list", row({ sources: {} })],
    ["a Source with no URL", row({ sources: [{ sourceId: "source-1", relevance: "why" }] })],
  ])("refuses %s as a safe persistence invariant", async (_label, invalid) => {
    const { repository } = repositoryFor([invalid]);

    await expect(
      repository.search({ terms: "anything", limit: 5, excludeStoryId: null }),
    ).rejects.toMatchObject({
      name: expect.stringMatching(/Postgres(Archive|Article)Invariant(Error)?/),
    });
  });

  it("propagates query failures rather than reporting an empty archive", async () => {
    const failure = new Error("controlled query failure");
    const repository = createPostgresArchiveRepository({
      pool: {
        query: vi.fn(async () => {
          throw failure;
        }),
      } as unknown as Pool,
    });

    await expect(
      repository.search({ terms: "anything", limit: 5, excludeStoryId: null }),
    ).rejects.toBe(failure);
  });
});
