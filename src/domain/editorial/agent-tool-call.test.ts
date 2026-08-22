import { describe, expect, it } from "vitest";

import {
  MAXIMUM_TOOL_RECORD_CHARACTERS,
  agentRunId,
  agentToolCallId,
  recordAgentToolCall,
  storyId,
  type AgentToolCall,
} from ".";

const base = {
  id: agentToolCallId("call-1"),
  runId: agentRunId("run-1"),
  storyId: storyId("story-1"),
  sequence: 1,
  tool: "fetch_url",
  request: { url: "https://example.test" },
  requestedAt: "requested",
  completedAt: "completed",
} as const;

const succeeded = (overrides: Partial<AgentToolCall> = {}): AgentToolCall =>
  ({
    ...base,
    outcome: "succeeded",
    result: { url: "https://example.test" },
    ...overrides,
  }) as AgentToolCall;

describe("recording what an agent reached for", () => {
  it("accepts a call naming any registered tool", () => {
    // Which tools exist is an operator's decision, so the record describes rather than constrains.
    expect(recordAgentToolCall(succeeded({ tool: "someones_own_tool" }))).toMatchObject({
      ok: true,
    });
  });

  it("records a refused call as durably as a successful one", () => {
    expect(
      recordAgentToolCall({
        ...base,
        outcome: "failed",
        failure: { code: "TOOL_BUDGET_EXHAUSTED", retryable: false, message: null },
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a position that is not within its run", () => {
    for (const sequence of [0, -1, 1.5]) {
      expect(recordAgentToolCall(succeeded({ sequence }))).toMatchObject({
        ok: false,
        error: { code: "AGENT_TOOL_CALL_SEQUENCE_INVALID" },
      });
    }
  });

  it("refuses a call that does not say which tool it used", () => {
    expect(recordAgentToolCall(succeeded({ tool: "  " }))).toMatchObject({
      ok: false,
      error: { code: "AGENT_TOOL_CALL_REQUEST_INVALID" },
    });
    expect(recordAgentToolCall(succeeded({ request: [] as never }))).toMatchObject({
      ok: false,
      error: { code: "AGENT_TOOL_CALL_REQUEST_INVALID" },
    });
  });

  it("refuses a result large enough to be a copy of the material", () => {
    // The record is an audit fact. Retrieved material becomes evidence with its own record.
    expect(
      recordAgentToolCall(succeeded({ result: "x".repeat(MAXIMUM_TOOL_RECORD_CHARACTERS + 1) })),
    ).toMatchObject({ ok: false, error: { code: "AGENT_TOOL_CALL_RECORD_TOO_LARGE" } });
  });

  it("refuses an unsupported failure code", () => {
    expect(
      recordAgentToolCall({
        ...base,
        outcome: "failed",
        failure: { code: "TOOL_WENT_ROGUE" as never, retryable: false, message: null },
      }),
    ).toMatchObject({ ok: false, error: { code: "AGENT_TOOL_CALL_OUTCOME_INVALID" } });
  });
});
