import { describe, expect, it } from "vitest";

import { recordPolicyRun } from "./policy-run";
import { operatorId, policyRunId, storyId } from "./types";
import type { PolicyRun } from "./policy-run-types";

const base = {
  id: policyRunId("policy-1"),
  storyId: storyId("story-1"),
  policy: "autopilot",
  requestedBy: { type: "operator", operatorId: operatorId("operator-1") },
  research: false,
  startedAt: "2026-08-26T00:00:00.000Z",
  step: "writer_draft",
  observedAt: "2026-08-26T00:00:10.000Z",
  status: "running",
} as PolicyRun;

describe("recording that work is under an automated policy", () => {
  it("accepts a run that has not reached a Story yet", () => {
    // A run started from a URL preserves, extracts and prepares before anything editorial
    // exists. Those are the minutes most likely to be interrupted, so the record has to be
    // writable before there is a Story to name.
    expect(recordPolicyRun({ ...base, storyId: null, step: "source_intake" })).toMatchObject({
      ok: true,
      run: { storyId: null, step: "source_intake" },
    });
  });

  it("accepts a run that has since learned which Story it made", () => {
    expect(recordPolicyRun(base)).toMatchObject({ ok: true, run: { storyId: base.storyId } });
  });

  it("refuses a Story named as an empty string, which names nothing", () => {
    expect(recordPolicyRun({ ...base, storyId: storyId("  ") })).toMatchObject({
      ok: false,
      error: { code: "POLICY_RUN_IDENTITY_INVALID" },
    });
  });

  it("refuses a step that is not part of any policy this system drives", () => {
    expect(recordPolicyRun({ ...base, step: "proofreading" as never })).toMatchObject({
      ok: false,
      error: { code: "POLICY_RUN_STEP_INVALID" },
    });
  });

  it("records the steps that carry a run from a URL to a delivered post", () => {
    for (const step of [
      "source_intake",
      "source_preparation",
      "story_creation",
      "source_attachment",
      "source_triage",
      "delivery",
    ] as const)
      expect(recordPolicyRun({ ...base, step })).toMatchObject({ ok: true, run: { step } });
  });

  it("refuses a settled run that does not say how it ended", () => {
    expect(
      recordPolicyRun({ ...base, status: "settled", conclusion: "completed" } as PolicyRun),
    ).toMatchObject({ ok: false, error: { code: "POLICY_RUN_OUTCOME_INVALID" } });
  });
});
