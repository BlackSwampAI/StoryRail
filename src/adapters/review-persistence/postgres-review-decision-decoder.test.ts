import { describe, expect, it } from "vitest";
import { decodePostgresReviewDecision } from "./postgres-review-decision-decoder";

const payload = {
  id: "decision-38",
  storyId: "story-38",
  articleId: "article-38",
  revisionId: "revision-38",
  directorRunId: "director-run-38",
  decision: "request_changes",
  reason: "Support the timeline.",
  decidedBy: { type: "operator", operatorId: "operator-38" },
  decidedAt: "decided",
} as const;

const row = (value: unknown = payload) => ({
  decision_id: payload.id,
  story_id: payload.storyId,
  article_id: payload.articleId,
  revision_id: payload.revisionId,
  director_run_id: payload.directorRunId,
  decision: payload.decision,
  payload: value,
});

describe("PostgreSQL ReviewDecision decoder", () => {
  it("strictly decodes an operator-owned decision", () => {
    expect(decodePostgresReviewDecision(row())).toEqual(payload);
  });

  it.each([
    { ...payload, extra: true },
    { ...payload, decidedBy: { type: "agent", role: "editor_in_chief", runId: "director-run-38" } },
    { ...payload, reason: " " },
  ])("rejects malformed decision payload %#", (candidate) => {
    expect(() => decodePostgresReviewDecision(row(candidate))).toThrowError(
      expect.objectContaining({ name: "PostgresReviewInvariantError" }),
    );
  });
});
