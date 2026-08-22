import { describe, expect, it } from "vitest";

import {
  agentProfileId,
  agentRunId,
  operatorId,
  storyId,
  type AgentRun,
  type StoryState,
} from "@/domain/editorial";

import {
  AUTOPILOT_IDLE_STOP_MS,
  autopilotProgress,
  resolveAutopilotFollow,
} from "./autopilot-follow";

const identity = storyId("story-follow");
const run = (id: string, outcome: AgentRun["outcome"]): AgentRun =>
  ({
    id: agentRunId(id),
    storyId: identity,
    profileId: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    operation: "assignment_proposal",
    model: { provider: "openrouter", model: "provider/model" },
    prompt: { key: "storyrail_assignment_editor", version: "1" },
    requestedBy: { type: "operator", operatorId: operatorId("operator-follow") },
    startedAt: "started",
    completedAt: outcome === "running" ? null : "completed",
    input: {
      story: { id: identity, title: "Story", state: "intake", revisionCycle: 0 },
      evidence: [],
      unavailableSourceIds: [],
      writerProfileIds: [agentProfileId("writer")],
    },
    outcome,
    ...(outcome === "failed"
      ? { failure: { code: "MODEL_OUTPUT_INVALID", retryable: true } }
      : outcome === "succeeded"
        ? {
            proposal: {
              writerProfileId: agentProfileId("writer"),
              angle: "Angle",
              brief: "Brief",
              constraints: null,
              reason: "Reason",
            },
          }
        : {}),
  }) as AgentRun;

const inspection = (state: StoryState, agentRuns: readonly AgentRun[], revisionCycle = 0) => ({
  story: {
    id: identity,
    title: "Story",
    state,
    revisionCycle,
    createdAt: "created",
    updatedAt: "updated",
  },
  agentRuns,
});

const follow = (
  state: StoryState,
  agentRuns: readonly AgentRun[],
  unchangedForMs: number,
  priorRunIds: ReadonlySet<string> = new Set(),
) =>
  resolveAutopilotFollow({ inspection: inspection(state, agentRuns), priorRunIds, unchangedForMs });

describe("following an autopilot run", () => {
  it("keeps following across the gap between two steps", () => {
    // Nothing is in flight, but autopilot is between steps: the poll must not stop here.
    expect(follow("assigned", [run("a", "succeeded")], 2_000)).toEqual({ kind: "following" });
  });

  it("settles when the Story reaches publication", () => {
    expect(follow("published", [run("a", "succeeded")], 0)).toEqual({
      kind: "settled",
      message: "Autopilot published the Story.",
    });
  });

  it("settles on a failed run and names the durable failure code", () => {
    const settled = follow("intake", [run("a", "failed")], 0);
    expect(settled.kind).toBe("settled");
    expect(settled.kind === "settled" && settled.message).toContain("MODEL_OUTPUT_INVALID");
  });

  it("ignores a failure that predates the run it is following", () => {
    expect(follow("assigned", [run("old", "failed")], 0, new Set(["old"]))).toEqual({
      kind: "following",
    });
  });

  it("keeps following a run that is still working, however long it takes", () => {
    expect(follow("in_review", [run("a", "running")], AUTOPILOT_IDLE_STOP_MS * 10)).toEqual({
      kind: "following",
    });
  });

  it("settles when the record goes quiet with nothing in flight", () => {
    expect(follow("in_review", [run("a", "succeeded")], AUTOPILOT_IDLE_STOP_MS)).toEqual({
      kind: "settled",
      message: "Autopilot stopped with the Story In review. Take it from here.",
    });
  });

  it("treats a new run and a changed outcome as progress", () => {
    expect(autopilotProgress(inspection("assigned", [run("a", "running")]))).not.toBe(
      autopilotProgress(inspection("assigned", [run("a", "succeeded")])),
    );
    expect(autopilotProgress(inspection("assigned", [run("a", "succeeded")]))).not.toBe(
      autopilotProgress(inspection("assigned", [run("a", "succeeded"), run("b", "running")])),
    );
    expect(autopilotProgress(inspection("in_review", [], 1))).not.toBe(
      autopilotProgress(inspection("in_review", [], 2)),
    );
  });
});
