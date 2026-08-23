// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { StructuredModel } from "@/application/model";

import { withOpenRouterTools } from "./openrouter-tool-assisted-model";

const schema = z.object({ answer: z.string() }).strict();
const base = {
  descriptor: { provider: "openrouter", model: "test-model" },
  limits: { maximumInputCharacters: 1000 },
  generateStructured: vi.fn(),
} as unknown as StructuredModel;

const mapFailure = () =>
  ({ ok: false, failure: { code: "MODEL_REQUEST_FAILED", retryable: true } }) as never;

function model(invoke: (input: unknown) => Promise<unknown>) {
  const bindTools = vi.fn(() => ({ invoke: vi.fn(invoke) }));
  return {
    bindTools,
    tool: withOpenRouterTools(base, {
      resolveChatModel: async () => ({ bindTools }) as never,
      mapFailure,
    }),
  };
}

const request = {
  systemPrompt: "system",
  input: { task: "go" },
  schema,
  tools: [{ name: "fetch_url", description: "Retrieve.", parameters: { type: "object" } }],
  transcript: [],
};

describe("offering tools to an OpenRouter model", () => {
  it("constrains the answer as well as binding the tools", async () => {
    // Binding tools alone leaves the answer unconstrained, and a model that has just used a
    // tool will happily reply in prose.
    const { bindTools, tool } = model(async () => ({ content: '{"answer":"done"}' }));

    await tool.generateWithTools(request);

    expect(bindTools).toHaveBeenCalledWith(
      [
        {
          type: "function",
          function: { name: "fetch_url", description: "Retrieve.", parameters: { type: "object" } },
        },
      ],
      expect.objectContaining({
        response_format: expect.objectContaining({ type: "json_schema" }),
      }),
    );
  });

  it("reports the tools a model asked for", async () => {
    const { tool } = model(async () => ({
      content: "",
      tool_calls: [{ id: "call-1", name: "fetch_url", args: { url: "https://example.test" } }],
    }));

    await expect(tool.generateWithTools(request)).resolves.toEqual({
      ok: true,
      output: {
        kind: "tools",
        calls: [
          { callId: "call-1", name: "fetch_url", arguments: { url: "https://example.test" } },
        ],
      },
    });
  });

  it("replays the exchange so the model sees what its calls returned", async () => {
    let sent: unknown = null;
    const { tool } = model(async (input) => {
      sent = input;
      return { content: '{"answer":"done"}' };
    });

    await tool.generateWithTools({
      ...request,
      transcript: [
        { kind: "requested", calls: [{ callId: "call-1", name: "fetch_url", arguments: {} }] },
        { kind: "resolved", callId: "call-1", content: "Retrieved text." },
      ],
    });

    expect(sent).toMatchObject([
      { role: "system" },
      { role: "user" },
      { role: "assistant", tool_calls: [expect.objectContaining({ id: "call-1" })] },
      // Tool output is handed back as data, never as instruction.
      { role: "tool", tool_call_id: "call-1", content: "Retrieved text." },
    ]);
  });

  it("accepts an answer a model fenced in Markdown", async () => {
    const { tool } = model(async () => ({ content: '```json\n{"answer":"done"}\n```' }));
    await expect(tool.generateWithTools(request)).resolves.toEqual({
      ok: true,
      output: { kind: "output", output: { answer: "done" } },
    });
  });

  it("refuses an answer that does not match the requested shape", async () => {
    const { tool } = model(async () => ({ content: '{"unexpected":true}' }));
    await expect(tool.generateWithTools(request)).resolves.toMatchObject({
      ok: false,
      failure: { code: "MODEL_OUTPUT_INVALID" },
    });
  });

  it("declares tool support so a workflow needing tools can require it", () => {
    const { tool } = model(async () => ({ content: "{}" }));
    expect(tool.supportsTools).toBe(true);
  });
});
