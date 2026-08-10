import { describe, expect, it, vi } from "vitest";

import { operatorId, sourceId } from "@/domain/editorial";

import { createRecordSourceTriageDecision } from "./record-source-triage-decision";
import type { SourceTriageDecisionRepository } from "./source-triage-repository";

describe("recordSourceTriageDecision", () => {
  it("validates before persistence and supplies one application timestamp", async () => {
    const repository: SourceTriageDecisionRepository = {
      findBySourceId: vi.fn(async () => null),
      record: vi.fn<SourceTriageDecisionRepository["record"]>(async (triageDecision) => ({
        ok: true,
        triageDecision,
      })),
    };
    const now = vi.fn(() => "authoritative-time");
    const workflow = createRecordSourceTriageDecision({ repository, now });

    await expect(
      workflow({
        sourceId: sourceId("source-24"),
        decision: "skip",
        storyId: null,
        reason: "  No material facts.  ",
        decidedBy: { type: "operator", operatorId: operatorId("operator-24") },
      }),
    ).resolves.toMatchObject({
      ok: true,
      triageDecision: { reason: "No material facts.", decidedAt: "authoritative-time" },
    });
    expect(repository.record).toHaveBeenCalledOnce();
    expect(now).toHaveBeenCalledOnce();
  });

  it("does not persist a blank reason", async () => {
    const repository: SourceTriageDecisionRepository = {
      findBySourceId: vi.fn(async () => null),
      record: vi.fn(),
    };
    const workflow = createRecordSourceTriageDecision({ repository, now: () => "time" });
    await expect(
      workflow({
        sourceId: sourceId("source-24"),
        decision: "skip",
        storyId: null,
        reason: "  ",
        decidedBy: { type: "operator", operatorId: operatorId("operator-24") },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "SOURCE_TRIAGE_REASON_REQUIRED" } });
    expect(repository.record).not.toHaveBeenCalled();
  });
});
