import { describe, expect, it } from "vitest";
import { createDirectorReview } from "./director-review";
import type { DirectorReviewRecommendation } from "./director-review-types";

const approval: DirectorReviewRecommendation = {
  recommendation: "approve",
  summary: "The Article is ready.",
  checks: {
    assignment: { status: "pass", note: "Matches the Assignment." },
    accuracy: { status: "pass", note: "Claims are supported by supplied evidence." },
    headline: { status: "pass", note: "Headline is supported." },
    structure: { status: "pass", note: "Organization is coherent." },
    style: { status: "pass", note: "Prose is clear." },
  },
  revisionInstructions: null,
};

describe("DirectorReviewRecommendation", () => {
  it("accepts a consistent approval", () => {
    expect(createDirectorReview(approval)).toMatchObject({ ok: true });
  });

  it("accepts a consistent request for changes", () => {
    expect(
      createDirectorReview({
        ...approval,
        recommendation: "request_changes",
        checks: {
          ...approval.checks,
          accuracy: { status: "needs_changes", note: "Support the timeline." },
        },
        revisionInstructions: "Add evidence for the timeline or remove the unsupported claim.",
      }),
    ).toMatchObject({ ok: true });
  });

  it("rejects approval with a needs-changes check", () => {
    expect(
      createDirectorReview({
        ...approval,
        checks: {
          ...approval.checks,
          style: { status: "needs_changes", note: "Tighten repetition." },
        },
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects approval with revision instructions", () => {
    expect(
      createDirectorReview({ ...approval, revisionInstructions: "Rewrite it." }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a change request without a needs-changes check", () => {
    expect(
      createDirectorReview({
        ...approval,
        recommendation: "request_changes",
        revisionInstructions: "Change it.",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a change request without actionable instructions", () => {
    expect(
      createDirectorReview({
        ...approval,
        recommendation: "request_changes",
        checks: {
          ...approval.checks,
          headline: { status: "needs_changes", note: "Overstates evidence." },
        },
        revisionInstructions: " ",
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects empty summaries and check notes", () => {
    expect(createDirectorReview({ ...approval, summary: " " })).toMatchObject({ ok: false });
    expect(
      createDirectorReview({
        ...approval,
        checks: { ...approval.checks, assignment: { status: "pass", note: " " } },
      }),
    ).toMatchObject({ ok: false });
  });
});
