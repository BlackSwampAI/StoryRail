import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { ToolAssistedModel, ToolAssistedTurn } from "@/application/model";
import { agentRunId, agentToolCallId, storyId, type AgentToolCall } from "@/domain/editorial";

import { createToolRegistry, type EditorialTool } from "./tool-registry";
import { runToolAssisted } from "./run-tool-assisted-turn";

const RUN = agentRunId("run-tools");
const STORY = storyId("story-tools");
const schema = z.object({ answer: z.string() }).strict();

function harness(
  turns: readonly ToolAssistedTurn<{ answer: string }>[],
  tools: readonly EditorialTool[],
  maximumCalls = 3,
) {
  const seen: unknown[] = [];
  const generateWithTools = vi.fn(async (request: { transcript: unknown; tools: unknown }) => {
    seen.push(request.transcript);
    const next = turns[seen.length - 1];
    return next === undefined
      ? { ok: false as const, failure: { code: "MODEL_OUTPUT_INVALID" as const, retryable: true } }
      : { ok: true as const, output: next };
  });
  const appended: AgentToolCall[] = [];
  let ids = 0;
  return {
    seen,
    appended,
    generateWithTools,
    run: () =>
      runToolAssisted({
        model: { supportsTools: true, generateWithTools } as unknown as ToolAssistedModel,
        registry: createToolRegistry(tools),
        calls: {
          append: vi.fn(async (call: AgentToolCall) => {
            appended.push(call);
            return { ok: true as const, call };
          }),
          listByRunId: vi.fn(async () => []),
        },
        systemPrompt: "system",
        input: {},
        schema,
        runId: RUN,
        storyId: STORY,
        maximumCalls,
        maximumTurns: 4,
        createToolCallId: () => agentToolCallId(`call-${(ids += 1)}`),
        now: () => "now",
      }),
  };
}

const fetcher = (name = "fetch_url"): EditorialTool => ({
  declaration: { name, description: "Retrieve a page.", parameters: { type: "object" } },
  execute: vi.fn(async () => ({
    ok: true as const,
    record: { url: "https://example.test" },
    content: "Retrieved text.",
  })),
});

describe("driving a model that has been offered tools", () => {
  it("runs what the model asks for, records it, and returns the answer", async () => {
    const test = harness(
      [
        {
          kind: "tools",
          calls: [{ callId: "a", name: "fetch_url", arguments: { url: "https://example.test" } }],
        },
        { kind: "output", output: { answer: "done" } },
      ],
      [fetcher()],
    );

    const { result, calls } = await test.run();

    expect(result).toEqual({ ok: true, output: { answer: "done" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      runId: RUN,
      storyId: STORY,
      sequence: 1,
      tool: "fetch_url",
      outcome: "succeeded",
      request: { url: "https://example.test" },
    });
    // The second turn sees what the first one asked for and what came back.
    expect(test.seen[1]).toEqual([
      {
        kind: "requested",
        calls: [{ callId: "a", name: "fetch_url", arguments: { url: "https://example.test" } }],
      },
      { kind: "resolved", callId: "a", content: "Retrieved text." },
    ]);
  });

  it("stops calling tools once the run has spent its budget", async () => {
    // The ceiling is counted here rather than asked of the model, so a model that keeps
    // reaching for more is stopped rather than trusted.
    const call = (id: string) => ({ callId: id, name: "fetch_url", arguments: { url: "x" } });
    const test = harness(
      [
        { kind: "tools", calls: [call("a"), call("b"), call("c")] },
        { kind: "tools", calls: [call("d")] },
        { kind: "output", output: { answer: "done" } },
      ],
      [fetcher()],
      2,
    );

    const { calls } = await test.run();

    expect(calls.map((entry) => entry.outcome)).toEqual([
      "succeeded",
      "succeeded",
      "failed",
      "failed",
    ]);
    expect(calls[2]).toMatchObject({ failure: { code: "TOOL_BUDGET_EXHAUSTED" } });
  });

  it("records a call for a tool the run was never given", async () => {
    const test = harness(
      [
        { kind: "tools", calls: [{ callId: "a", name: "delete_everything", arguments: {} }] },
        { kind: "output", output: { answer: "done" } },
      ],
      [fetcher()],
    );

    const { calls } = await test.run();

    expect(calls[0]).toMatchObject({
      tool: "delete_everything",
      outcome: "failed",
      failure: { code: "TOOL_NOT_AVAILABLE" },
    });
  });

  it("reports a refusal back to the model instead of hiding it", async () => {
    const refusing: EditorialTool = {
      declaration: { name: "fetch_url", description: "Retrieve.", parameters: { type: "object" } },
      execute: vi.fn(async () => ({
        ok: false as const,
        failure: {
          code: "TOOL_TARGET_REFUSED" as const,
          retryable: false,
          message: "Only http and https addresses are retrieved.",
        },
      })),
    };
    const test = harness(
      [
        {
          kind: "tools",
          calls: [{ callId: "a", name: "fetch_url", arguments: { url: "file:///etc" } }],
        },
        { kind: "output", output: { answer: "done" } },
      ],
      [refusing],
    );

    await test.run();

    expect(test.seen[1]).toContainEqual({
      kind: "resolved",
      callId: "a",
      content: "The tool failed: TOOL_TARGET_REFUSED.",
    });
  });

  it("records a call whose tool threw rather than losing it", async () => {
    const throwing: EditorialTool = {
      declaration: { name: "fetch_url", description: "Retrieve.", parameters: { type: "object" } },
      execute: vi.fn(async () => {
        throw new Error("network");
      }),
    };
    const test = harness(
      [
        { kind: "tools", calls: [{ callId: "a", name: "fetch_url", arguments: {} }] },
        { kind: "output", output: { answer: "done" } },
      ],
      [throwing],
    );

    const { calls } = await test.run();
    expect(calls[0]).toMatchObject({
      outcome: "failed",
      failure: { code: "TOOL_EXECUTION_FAILED" },
    });
  });

  it("stops offering tools once the budget is spent, so a turn is left to answer with", async () => {
    // Observed live: a Researcher spent all four calls and then had no turn left, and was
    // reported as returning bad output for a budget the loop set.
    const call = (id: string) => ({ callId: id, name: "fetch_url", arguments: { url: "x" } });
    const test = harness(
      [
        { kind: "tools", calls: [call("a"), call("b")] },
        { kind: "output", output: { answer: "done" } },
      ],
      [fetcher()],
      2,
    );

    const { result } = await test.run();

    expect(result).toEqual({ ok: true, output: { answer: "done" } });
    const offered = test.generateWithTools.mock.calls.map(
      (invocation) => (invocation[0] as unknown as { tools: readonly unknown[] }).tools.length,
    );
    expect(offered).toEqual([1, 0]);
  });

  it("offers no tools on the final turn, whatever the call budget", async () => {
    const call = { callId: "a", name: "fetch_url", arguments: {} };
    const test = harness(
      [
        { kind: "tools", calls: [call] },
        { kind: "tools", calls: [call] },
        { kind: "tools", calls: [call] },
        { kind: "output", output: { answer: "done" } },
      ],
      [fetcher()],
      10,
    );

    // maximumTurns is 4 in the harness, so the fourth turn arrives without tools and the model
    // has to answer with what it already gathered.
    await expect(test.run()).resolves.toMatchObject({ result: { ok: true } });
    expect(
      test.generateWithTools.mock.calls.map(
        (invocation) => (invocation[0] as unknown as { tools: readonly unknown[] }).tools.length,
      ),
    ).toEqual([1, 1, 1, 0]);
  });

  it("gives up when the model keeps reaching for tools instead of answering", async () => {
    const call = { callId: "a", name: "fetch_url", arguments: {} };
    const test = harness(
      [
        { kind: "tools", calls: [call] },
        { kind: "tools", calls: [call] },
        { kind: "tools", calls: [call] },
        { kind: "tools", calls: [call] },
      ],
      [fetcher()],
      10,
    );

    const { result } = await test.run();
    expect(result).toMatchObject({ ok: false, failure: { code: "MODEL_OUTPUT_INVALID" } });
    expect(test.generateWithTools).toHaveBeenCalledTimes(4);
  });

  it("returns a model failure without pretending a turn happened", async () => {
    const test = harness([], [fetcher()]);
    const { result, calls } = await test.run();
    expect(result).toMatchObject({ ok: false });
    expect(calls).toHaveLength(0);
  });
});
