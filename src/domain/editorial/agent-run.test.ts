import { describe, expect, it } from "vitest";

import {
  agentProfileId,
  agentRunId,
  operatorId,
  sourceEvidencePreparationId,
  sourceId,
  storyId,
} from "./types";
import type { AgentRun } from "./agent-run-types";
import { recordAgentRun } from "./agent-run";

const successful: AgentRun = {
  id: agentRunId("run-0030"),
  storyId: storyId("story-0030"),
  profileId: agentProfileId("storyrail-assignment-editor-v1"),
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-0030") },
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: {
      id: storyId("story-0030"),
      title: "Story",
      state: "intake",
      revisionCycle: 0,
    },
    evidence: [
      {
        sourceId: sourceId("source-0030"),
        relevance: "Primary report",
        evidenceKind: "prepared",
        evidenceId: sourceEvidencePreparationId("prepared-0030"),
      },
    ],
    unavailableSourceIds: [sourceId("source-unavailable")],
    writerProfileIds: [agentProfileId("writer-0030")],
  },
  outcome: "succeeded",
  proposal: {
    writerProfileId: agentProfileId("writer-0030"),
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    reason: "Reason",
  },
};

describe("AgentRun", () => {
  it("records a valid successful run as a fresh immutable snapshot", () => {
    const result = recordAgentRun(successful);
    expect(result).toEqual({ ok: true, run: successful });
    if (result.ok) expect(result.run).not.toBe(successful);
  });

  it("records a valid failed run", () => {
    const { proposal: _proposal, ...common } = successful;
    void _proposal;
    expect(
      recordAgentRun({
        ...common,
        outcome: "failed",
        failure: { code: "MODEL_REQUEST_TIMED_OUT", retryable: true },
      }),
    ).toMatchObject({ ok: true, run: { outcome: "failed" } });
  });

  it("rejects unsupported role/operation combinations and blank descriptors", () => {
    expect(
      recordAgentRun({ ...successful, operation: "other" } as unknown as AgentRun),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_ROLE_OPERATION_INVALID" } });
    expect(recordAgentRun({ ...successful, prompt: { key: "", version: "1" } })).toMatchObject({
      ok: false,
      error: { code: "AGENT_RUN_PROMPT_INVALID" },
    });
  });

  it("rejects duplicate or contradictory evidence references", () => {
    const reference = successful.input.evidence[0]!;
    expect(
      recordAgentRun({
        ...successful,
        input: { ...successful.input, evidence: [reference, reference] },
      }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_EVIDENCE_DUPLICATE" } });
  });

  it("rejects malformed success and failure outcomes", () => {
    expect(
      recordAgentRun({ ...successful, proposal: { ...successful.proposal, brief: " " } }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_OUTCOME_INVALID" } });
    expect(
      recordAgentRun({
        ...successful,
        outcome: "failed",
        failure: { code: "UNKNOWN", retryable: false },
      } as unknown as AgentRun),
    ).toMatchObject({ ok: false, error: { code: "AGENT_RUN_OUTCOME_INVALID" } });
  });
});
