// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";

import { createPostgresStoryListingRepository } from "./postgres-story-listing-repository";

const SITE = siteId("site-default");

const PAYLOAD = {
  id: "story-listing-adapter",
  title: "Adapter-listed Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "opaque-created",
  updatedAt: "opaque-updated",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    story_id: PAYLOAD.id,
    story_state: PAYLOAD.state,
    story_revision_cycle: PAYLOAD.revisionCycle,
    story_payload: PAYLOAD,
    source_count: "2",
    ...overrides,
  };
}

describe("createPostgresStoryListingRepository", () => {
  it("uses one read-only grouped query and decodes PostgreSQL bigint counts", async () => {
    const query = vi.fn(async () => ({ rows: [row()] }));
    const repository = createPostgresStoryListingRepository({
      pool: { query } as unknown as Pool,
      siteId: SITE,
    });

    await expect(repository.list()).resolves.toEqual([{ story: PAYLOAD, sourceCount: 2 }]);
    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY story.story_id COLLATE "C" ASC'),
      [SITE],
    );
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE story.site_id = $1"), [SITE]);
  });

  it.each([
    ["negative count", row({ source_count: "-1" })],
    ["fractional count", row({ source_count: 1.5 })],
    ["mismatched relational state", row({ story_state: "approved" })],
    ["incomplete payload", row({ story_payload: { id: PAYLOAD.id } })],
  ])("rejects %s as a safe persistence invariant", async (_label, invalidRow) => {
    const repository = createPostgresStoryListingRepository({
      pool: { query: vi.fn(async () => ({ rows: [invalidRow] })) } as unknown as Pool,
      siteId: SITE,
    });
    await expect(repository.list()).rejects.toMatchObject({
      name: "PostgresStoryListingPersistenceInvariantError",
      message: "PostgreSQL Story listing returned an invalid persisted result.",
    });
  });

  it("propagates query failures without translating them into an empty list", async () => {
    const failure = new Error("controlled query failure");
    const repository = createPostgresStoryListingRepository({
      pool: {
        query: vi.fn(async () => {
          throw failure;
        }),
      } as unknown as Pool,
      siteId: SITE,
    });
    await expect(repository.list()).rejects.toBe(failure);
  });
});
