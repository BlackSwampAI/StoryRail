// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  operatorId,
  storyId,
  transitionId,
  type Story,
  type StoryTransitionReceipt,
} from "@/domain/editorial";
import { createPostgresStoryPublicationPersistence } from "./postgres-story-publication-persistence";

const current: Story = {
  id: storyId("story-43"),
  title: "Story",
  state: "approved",
  revisionCycle: 1,
  createdAt: "created",
  updatedAt: "reviewed",
};
const published: Story = { ...current, state: "published", updatedAt: "published" };
const receipt: StoryTransitionReceipt = {
  transitionId: transitionId("transition-43"),
  storyId: current.id,
  previousState: "approved",
  nextState: "published",
  actor: { type: "operator", operatorId: operatorId("operator-43") },
  reason: "Coverage is no longer warranted.",
  occurredAt: "published",
  revisionCycle: 1,
};

const storyRow = (story: Story) => ({
  story_id: story.id,
  state: story.state,
  revision_cycle: story.revisionCycle,
  payload: story,
});
const receiptRow = (value: StoryTransitionReceipt) => ({
  transition_id: value.transitionId,
  story_id: value.storyId,
  previous_state: value.previousState,
  next_state: value.nextState,
  revision_cycle: value.revisionCycle,
  payload: value,
});

describe("PostgreSQL Story publication persistence", () => {
  it("atomically updates the expected Story and appends its transition receipt", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT") return { rows: [] };
      if (sql.includes("FOR UPDATE")) return { rows: [storyRow(current)] };
      if (sql.includes("UPDATE storyrail.stories")) return { rows: [storyRow(published)] };
      if (sql.includes("INSERT INTO storyrail.story_transition_receipts"))
        return { rows: [receiptRow(receipt)] };
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const release = vi.fn();
    const pool = {
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as Pool;

    await expect(
      createPostgresStoryPublicationPersistence({ pool }).persist({
        expectedStory: current,
        story: published,
        transitionReceipt: receipt,
      }),
    ).resolves.toEqual({ ok: true, story: published, transitionReceipt: receipt });

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("FOR UPDATE"),
      expect.stringContaining("UPDATE storyrail.stories"),
      expect.stringContaining("INSERT INTO storyrail.story_transition_receipts"),
      "COMMIT",
    ]);
    const executedSql = query.mock.calls.map(([sql]) => String(sql)).join("\n");
    expect(executedSql).not.toMatch(/DELETE/i);
    expect(executedSql).not.toMatch(
      /UPDATE storyrail\.(?:sources|story_source_attachments|source_extractions|source_evidence_preparations|story_assignments|agent_profiles|agent_runs|articles|article_revisions|review_decisions)/i,
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back without writing when the authoritative Story changed", async () => {
    const changed = { ...current, updatedAt: "concurrent-change" };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [storyRow(changed)] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const pool = {
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as Pool;

    await expect(
      createPostgresStoryPublicationPersistence({ pool }).persist({
        expectedStory: current,
        story: published,
        transitionReceipt: receipt,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_PUBLICATION_CONFLICT" } });

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back the Story update when receipt insertion fails", async () => {
    const failure = new Error("controlled receipt failure");
    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FOR UPDATE")) return { rows: [storyRow(current)] };
      if (sql.includes("UPDATE storyrail.stories")) return { rows: [storyRow(published)] };
      if (sql.includes("INSERT INTO storyrail.story_transition_receipts")) throw failure;
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const release = vi.fn();
    const pool = {
      connect: vi.fn(async () => ({ query, release })),
    } as unknown as Pool;

    await expect(
      createPostgresStoryPublicationPersistence({ pool }).persist({
        expectedStory: current,
        story: published,
        transitionReceipt: receipt,
      }),
    ).rejects.toBe(failure);

    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
});
