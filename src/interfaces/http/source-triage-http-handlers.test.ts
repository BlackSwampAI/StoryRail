// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { StoryRuntime } from "@/runtime";
import { sourceId } from "@/domain/editorial";

import { createListSourceInboxHttpHandler } from "./list-source-inbox-handler";
import { createRecordSourceTriageDecisionHttpHandler } from "./record-source-triage-decision-handler";

function runtime(overrides: Partial<StoryRuntime>): StoryRuntime {
  return overrides as StoryRuntime;
}

describe("Source Inbox HTTP handlers", () => {
  it("returns an empty pending inbox", async () => {
    const response = await createListSourceInboxHttpHandler({
      getRuntime: () => runtime({ listPendingSources: vi.fn(async () => []) }),
    })();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, sources: [] });
  });

  it("derives operator provenance and accepts the exact skip shape", async () => {
    const record = vi.fn<StoryRuntime["recordSourceTriageDecision"]>(async (command) => ({
      ok: true,
      triageDecision: { ...command, decidedAt: "authoritative-time" },
    }));
    const handler = createRecordSourceTriageDecisionHttpHandler({
      getRuntime: () => runtime({ recordSourceTriageDecision: record }),
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-server" },
    });
    const response = await handler(
      new Request("https://storyrail.test/api/sources/source-24/triage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "skip", storyId: null, reason: " No coverage. " }),
      }),
      { params: Promise.resolve({ sourceId: "source-24" }) },
    );
    expect(response.status).toBe(200);
    expect(record).toHaveBeenCalledWith({
      sourceId: sourceId("source-24"),
      decision: "skip",
      storyId: null,
      reason: " No coverage. ",
      decidedBy: { type: "operator", operatorId: "operator-server" },
    });
  });

  it.each([
    ["text/plain", "{}", 415],
    ["application/json", "{", 400],
    ["application/json", JSON.stringify({ decision: "skip", reason: "x" }), 400],
  ])("rejects invalid media or body", async (contentType, body, status) => {
    const handler = createRecordSourceTriageDecisionHttpHandler({
      getRuntime: () => runtime({}),
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-server" },
    });
    const response = await handler(
      new Request("https://storyrail.test", {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body,
      }),
      { params: Promise.resolve({ sourceId: "source-24" }) },
    );
    expect(response.status).toBe(status);
  });
});
