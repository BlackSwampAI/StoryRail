import { describe, expect, it } from "vitest";

import { agentProfileId, agentRunId, operatorId, storyId, type AgentRun } from "@/domain/editorial";

import { withRun } from "./agent-run-list";

const identity = storyId("story-run-list");
const run = (id: string, outcome: AgentRun["outcome"]): AgentRun =>
  ({
    id: agentRunId(id),
    storyId: identity,
    profileId: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    operation: "assignment_proposal",
    model: { provider: "openrouter", model: "provider/model" },
    prompt: { key: "storyrail_assignment_editor", version: "1" },
    requestedBy: { type: "operator", operatorId: operatorId("operator-run-list") },
    startedAt: "started",
    completedAt: outcome === "running" ? null : "completed",
    input: {
      story: { id: identity, title: "Story", state: "intake", revisionCycle: 0 },
      evidence: [],
      unavailableSourceIds: [],
      writerProfileIds: [agentProfileId("writer")],
    },
    outcome,
    ...(outcome === "failed" ? { failure: { code: "MODEL_OUTPUT_INVALID", retryable: true } } : {}),
  }) as AgentRun;

describe("withRun", () => {
  it("keeps one entry when the poll already stored the run a handler is reporting", () => {
    const listed = withRun([run("a", "running"), run("b", "running")], run("b", "failed"));

    expect(listed.map(({ id }) => id)).toEqual([agentRunId("a"), agentRunId("b")]);
    expect(listed[1]?.outcome).toBe("failed");
  });

  it("leaves the surrounding order untouched when it replaces a run in place", () => {
    const listed = withRun(
      [run("a", "running"), run("b", "running"), run("c", "running")],
      run("b", "failed"),
    );

    expect(listed.map(({ id }) => id)).toEqual([agentRunId("a"), agentRunId("b"), agentRunId("c")]);
  });

  it("appends a run the list has never seen", () => {
    const listed = withRun([run("a", "running")], run("b", "running"));

    expect(listed.map(({ id }) => id)).toEqual([agentRunId("a"), agentRunId("b")]);
  });
});
