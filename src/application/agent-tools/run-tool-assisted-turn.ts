import type {
  StructuredModelResult,
  ToolAssistedModel,
  ToolTranscriptEntry,
} from "@/application/model";
import {
  recordAgentToolCall,
  type AgentRunId,
  type AgentToolCall,
  type AgentToolCallId,
  type StoryId,
  type ToolFailureCode,
} from "@/domain/editorial";
import type { ZodType } from "zod";

import type { AgentToolCallRepository } from "./agent-tool-call-repository";
import type { ToolRegistry } from "./tool-registry";

export interface ToolAssistedRunResult<Output> {
  readonly result: StructuredModelResult<Output>;
  readonly calls: readonly AgentToolCall[];
}

export interface RunToolAssistedOptions<Output> {
  readonly model: ToolAssistedModel;
  readonly registry: ToolRegistry;
  readonly calls: AgentToolCallRepository;
  readonly systemPrompt: string;
  readonly input: unknown;
  readonly schema: ZodType<Output>;
  readonly runId: AgentRunId;
  readonly storyId: StoryId;
  /**
   * The most tool calls this run may make. The ceiling is enforced here rather than asked of
   * the model, so a model that keeps reaching for more is stopped rather than trusted.
   */
  readonly maximumCalls: number;
  /** How many exchanges the model may take before it must answer. */
  readonly maximumTurns: number;
  readonly createToolCallId: () => AgentToolCallId;
  readonly now: () => string;
}

function refusal(
  code: ToolFailureCode,
  message: string,
): { readonly code: ToolFailureCode; readonly retryable: boolean; readonly message: string } {
  return { code, retryable: code === "TOOL_EXECUTION_FAILED", message };
}

/**
 * Drives a model that has been offered tools, executing what it asks for and recording every
 * call before the answer exists.
 *
 * Two ceilings bound the exchange: how many tools may be used at all, and how many turns the
 * model may take before it has to answer. Both are counted here, because a budget the model is
 * merely told about is a request, not a limit. A refused call is reported back to the model as
 * its result, so it can adjust rather than repeat itself, and it is recorded either way.
 *
 * Whatever a tool returns is untrusted material. It is handed to the model as data and never as
 * instruction, exactly as Source evidence is.
 */
export async function runToolAssisted<Output>(
  options: RunToolAssistedOptions<Output>,
): Promise<ToolAssistedRunResult<Output>> {
  const transcript: ToolTranscriptEntry[] = [];
  const recorded: AgentToolCall[] = [];
  let used = 0;

  for (let turn = 0; turn < options.maximumTurns; turn += 1) {
    const generated = await options.model.generateWithTools({
      systemPrompt: options.systemPrompt,
      input: options.input,
      schema: options.schema,
      tools: options.registry.declarations,
      transcript,
    });
    if (!generated.ok) return { result: generated, calls: recorded };
    if (generated.output.kind === "output")
      return { result: { ok: true, output: generated.output.output }, calls: recorded };

    const requests = generated.output.calls;
    transcript.push({ kind: "requested", calls: requests });

    for (const request of requests) {
      const requestedAt = options.now();
      const tool = options.registry.find(request.name);
      const outcome =
        used >= options.maximumCalls
          ? {
              ok: false as const,
              failure: refusal(
                "TOOL_BUDGET_EXHAUSTED",
                `This run may make at most ${options.maximumCalls} tool calls.`,
              ),
            }
          : tool === undefined
            ? {
                ok: false as const,
                failure: refusal(
                  "TOOL_NOT_AVAILABLE",
                  `No tool named ${request.name} is available.`,
                ),
              }
            : await tool
                .execute(request.arguments as { readonly [key: string]: never })
                .catch(() => ({
                  ok: false as const,
                  failure: refusal("TOOL_EXECUTION_FAILED", "The tool did not complete."),
                }));

      if (used < options.maximumCalls) used += 1;
      const candidate = recordAgentToolCall({
        id: options.createToolCallId(),
        runId: options.runId,
        storyId: options.storyId,
        sequence: recorded.length + 1,
        tool: request.name,
        request: request.arguments as { readonly [key: string]: never },
        requestedAt,
        completedAt: options.now(),
        ...(outcome.ok
          ? { outcome: "succeeded" as const, result: outcome.record }
          : { outcome: "failed" as const, failure: outcome.failure }),
      });
      if (candidate.ok) {
        const appended = await options.calls.append(candidate.call);
        if (appended.ok) recorded.push(appended.call);
      }

      transcript.push({
        kind: "resolved",
        callId: request.callId,
        content: outcome.ok ? outcome.content : `The tool failed: ${outcome.failure.code}.`,
      });
    }
  }

  // The model kept reaching for tools instead of answering. That is a bounded, reportable
  // outcome rather than a loop left to run.
  return {
    result: { ok: false, failure: { code: "MODEL_OUTPUT_INVALID", retryable: true } },
    calls: recorded,
  };
}
