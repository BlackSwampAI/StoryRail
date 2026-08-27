import { describe, expect, it } from "vitest";

import {
  decodePostgresAgentToolCall,
  PostgresAgentToolCallInvariantError,
} from "./postgres-agent-tool-call-decoder";

const payload = {
  id: "call-decoder",
  runId: "run-decoder",
  storyId: "story-decoder",
  sequence: 1,
  tool: "fetch_url",
  request: { url: "https://example.test/report" },
  requestedAt: "opaque-requested",
  outcome: "succeeded",
  completedAt: "opaque-completed",
  result: { status: 200 },
} as const;

describe("PostgreSQL Agent tool-call decoder", () => {
  it("decodes a valid payload without changing it", () => {
    const before = structuredClone(payload);

    expect(decodePostgresAgentToolCall(payload)).toEqual(payload);
    expect(payload).toEqual(before);
  });

  it("rejects an unexpected top-level key with the persistence invariant", () => {
    expect(() => decodePostgresAgentToolCall({ ...payload, unexpected: true })).toThrow(
      PostgresAgentToolCallInvariantError,
    );
  });
});
