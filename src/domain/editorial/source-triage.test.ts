import { describe, expect, it } from "vitest";

import { agentRunId, operatorId, sourceId, storyId } from "./types";
import { decideSourceTriage } from "./source-triage";

const base = {
  sourceId: sourceId("source-24"),
  storyId: storyId("story-24"),
  reason: "  Materially new reporting.  ",
  decidedBy: { type: "operator", operatorId: operatorId("operator-1") } as const,
  decidedAt: "2026-08-10T12:00:00.000Z",
};

describe("decideSourceTriage", () => {
  it.each(["new_story", "existing_story"] as const)("creates a trimmed %s decision", (decision) => {
    expect(decideSourceTriage({ ...base, decision })).toEqual({
      ok: true,
      triageDecision: { ...base, decision, reason: "Materially new reporting." },
    });
  });

  it("creates a skip decision with operator provenance", () => {
    expect(decideSourceTriage({ ...base, decision: "skip", storyId: null })).toMatchObject({
      ok: true,
      triageDecision: { decision: "skip", storyId: null, decidedBy: base.decidedBy },
    });
  });

  it("supports future assignment-editor agent provenance", () => {
    const decidedBy = {
      type: "agent",
      role: "assignment_editor",
      runId: agentRunId("run-24"),
    } as const;
    expect(decideSourceTriage({ ...base, decision: "new_story", decidedBy })).toMatchObject({
      ok: true,
      triageDecision: { decidedBy },
    });
  });

  it("rejects an empty trimmed reason", () => {
    expect(decideSourceTriage({ ...base, decision: "new_story", reason: " \n " })).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRIAGE_REASON_REQUIRED" },
    });
  });

  it("requires a Story for linked decisions", () => {
    expect(
      decideSourceTriage({ ...base, decision: "existing_story", storyId: null }),
    ).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRIAGE_STORY_REQUIRED" },
    });
  });

  it("forbids a Story for skip", () => {
    expect(decideSourceTriage({ ...base, decision: "skip" })).toMatchObject({
      ok: false,
      error: { code: "SOURCE_TRIAGE_STORY_FORBIDDEN" },
    });
  });
});
