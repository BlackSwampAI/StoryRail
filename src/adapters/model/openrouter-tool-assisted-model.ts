import { toJSONSchema, type ZodType } from "zod";

import type {
  StructuredModel,
  StructuredModelResult,
  ToolAssistedModel,
  ToolAssistedRequest,
  ToolAssistedTurn,
  ToolTranscriptEntry,
} from "@/application/model";

/** The parts of a bound chat model this adapter uses, kept narrow so it can be substituted. */
interface ToolBoundRunnable {
  invoke(input: unknown, options?: { readonly timeout?: number }): Promise<unknown>;
}

export interface ToolBindingChatModel {
  bindTools(
    tools: readonly {
      readonly type: "function";
      readonly function: {
        readonly name: string;
        readonly description: string;
        readonly parameters: Readonly<Record<string, unknown>>;
      };
    }[],
    options?: Readonly<Record<string, unknown>>,
  ): ToolBoundRunnable;
}

interface ChatToolCall {
  readonly id?: string;
  readonly name?: string;
  readonly args?: Record<string, unknown>;
}

function messagesFrom(
  systemPrompt: string,
  input: unknown,
  transcript: readonly ToolTranscriptEntry[],
): unknown[] {
  const messages: unknown[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(input) },
  ];
  for (const entry of transcript) {
    if (entry.kind === "requested") {
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: entry.calls.map((call) => ({
          id: call.callId,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      });
      continue;
    }
    // Tool output is untrusted material handed back as data, exactly as Source evidence is.
    messages.push({ role: "tool", tool_call_id: entry.callId, content: entry.content });
  }
  return messages;
}

function readToolCalls(message: unknown): readonly ChatToolCall[] {
  const calls = (message as { readonly tool_calls?: readonly ChatToolCall[] } | null)?.tool_calls;
  return Array.isArray(calls) ? calls : [];
}

function readText(message: unknown): string {
  const content = (message as { readonly content?: unknown } | null)?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((part) =>
        typeof part === "object" && part !== null && "text" in part
          ? String((part as { readonly text: unknown }).text)
          : "",
      )
      .join("");
  return "";
}

/**
 * Adds tool use to an existing structured model without disturbing the single-shot path.
 *
 * Tool support is declared rather than assumed: a workflow that needs tools asks for a model
 * that has them, so it fails on one that cannot rather than quietly answering without them.
 */
export function withOpenRouterTools(
  model: StructuredModel,
  dependencies: {
    /**
     * Built per request rather than held, because the credential it carries is read from the
     * per-Site store at the moment of use and a model bound once would keep the first key it saw.
     */
    readonly resolveChatModel: () => Promise<ToolBindingChatModel>;
    readonly timeoutMilliseconds?: number;
    readonly mapFailure: (error: unknown) => StructuredModelResult<never>;
  },
): ToolAssistedModel {
  const timeout = dependencies.timeoutMilliseconds ?? 60_000;
  return Object.freeze({
    ...model,
    supportsTools: true as const,
    async generateWithTools<Output>(
      request: ToolAssistedRequest<Output>,
    ): Promise<StructuredModelResult<ToolAssistedTurn<Output>>> {
      try {
        const chatModel = await dependencies.resolveChatModel();
        // Binding tools alone leaves the answer unconstrained, and a model that has just used a
        // tool will happily reply in prose. Constraining the response as well means each turn is
        // either a tool call or an answer in the shape the caller asked for — never neither.
        const bound = chatModel.bindTools(
          request.tools.map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          })),
          {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "storyrail_tool_assisted_response",
                strict: true,
                schema: toJSONSchema(request.schema as ZodType, { io: "output" }),
              },
            },
          },
        );
        const message = await bound.invoke(
          messagesFrom(request.systemPrompt, request.input, request.transcript),
          { timeout },
        );

        const calls = readToolCalls(message);
        if (calls.length > 0) {
          return {
            ok: true,
            output: {
              kind: "tools",
              calls: calls.map((call, index) => ({
                callId: call.id ?? `call-${index}`,
                name: call.name ?? "",
                arguments: call.args ?? {},
              })),
            },
          };
        }

        // No tools requested, so this turn is meant to be the answer.
        const text = readText(message).trim();
        const candidate = extract(text);
        if (candidate === null) return { ok: false, failure: fail("MODEL_OUTPUT_INVALID", false) };
        const parsed = (request.schema as ZodType<Output>).safeParse(candidate);
        return parsed.success
          ? { ok: true, output: { kind: "output", output: parsed.data } }
          : { ok: false, failure: fail("MODEL_OUTPUT_INVALID", false) };
      } catch (error) {
        return dependencies.mapFailure(error) as StructuredModelResult<ToolAssistedTurn<Output>>;
      }
    },
  });
}

function fail(code: "MODEL_OUTPUT_INVALID", retryable: boolean) {
  return { code, retryable } as const;
}

/** Models fence JSON in Markdown often enough that refusing it would report a phantom failure. */
function extract(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  if (candidate.length === 0) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}
