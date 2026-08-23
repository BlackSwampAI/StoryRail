import {
  ChatOpenRouter,
  OpenRouterAuthError,
  OpenRouterError,
  OpenRouterRateLimitError,
} from "@langchain/openrouter";
import { OutputParserException } from "@langchain/core/output_parsers";
import { ZodError, type ZodType } from "zod";

import type {
  StructuredModel,
  StructuredModelRequest,
  StructuredModelResult,
} from "@/application/model";
import type { ModelFailureCode } from "@/domain/editorial";

interface StructuredRunnable {
  invoke(input: unknown, options?: { readonly timeout?: number }): Promise<unknown>;
}

interface OpenRouterChatModel {
  withStructuredOutput(
    schema: ZodType<Record<string, unknown>>,
    options: { readonly name: string; readonly strict: true },
  ): StructuredRunnable;
}

/**
 * OpenRouter fronts many models with different context windows, so the adapter cannot know a
 * per-model figure without a catalogue lookup. This is a deliberately conservative floor that
 * every model it routes to can accept; callers with a known model may raise it.
 *
 * The value is bounded by throughput rather than context: the largest evidence observed to
 * prepare successfully inside the request timeout was about 69,000 characters, so the floor
 * sits below that with room for reasoning variance.
 */
export const DEFAULT_MAXIMUM_INPUT_CHARACTERS = 60_000;

export interface CreateOpenRouterStructuredModelOptions {
  /**
   * Resolved when a request is made, never when the model is built. The runtime providers cache
   * the runtime they construct for the life of the process, so a key read at construction would
   * be the key that process used until it restarted, and a key changed by an operator would
   * appear to do nothing.
   */
  readonly resolveApiKey: () => Promise<string>;
  readonly model: string;
  readonly timeoutMilliseconds?: number;
  readonly maximumInputCharacters?: number;
  readonly createChatModel?: (configuration: {
    readonly apiKey: string;
    readonly model: string;
    readonly maxRetries: 0;
  }) => OpenRouterChatModel;
}

export class OpenRouterStructuredModelConfigurationError extends Error {
  constructor(readonly code: "OPENROUTER_API_KEY_REQUIRED" | "MODEL_REQUIRED") {
    super(
      code === "OPENROUTER_API_KEY_REQUIRED"
        ? "An OpenRouter API key is required."
        : "A model is required.",
    );
    this.name = "OpenRouterStructuredModelConfigurationError";
  }
}

function failed<Output>(code: ModelFailureCode, retryable: boolean): StructuredModelResult<Output> {
  return { ok: false, failure: { code, retryable } };
}

function mapFailure<Output>(error: unknown): StructuredModelResult<Output> {
  if (error instanceof ZodError || error instanceof OutputParserException) {
    return failed("MODEL_OUTPUT_INVALID", false);
  }
  if (OpenRouterAuthError.isInstance(error)) {
    return failed("MODEL_AUTHENTICATION_FAILED", false);
  }
  if (OpenRouterRateLimitError.isInstance(error)) return failed("MODEL_REQUEST_FAILED", true);
  if (OpenRouterError.isInstance(error)) {
    if (error.statusCode === 408 || error.statusCode === 504) {
      return failed("MODEL_REQUEST_TIMED_OUT", true);
    }
    // Payment Required means the credential works but the account cannot fund the request.
    // Reporting that as a rejected response sends the operator looking at the wrong thing.
    if (error.statusCode === 402) {
      return failed("MODEL_QUOTA_EXHAUSTED", false);
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return failed("MODEL_RESPONSE_REJECTED", false);
    }
    return failed("MODEL_REQUEST_FAILED", true);
  }
  if (typeof error === "object" && error !== null && ("name" in error || "code" in error)) {
    const candidate = error as { readonly name?: unknown; readonly code?: unknown };
    if (
      candidate.name === "AbortError" ||
      candidate.name === "TimeoutError" ||
      candidate.code === "ETIMEDOUT"
    ) {
      return failed("MODEL_REQUEST_TIMED_OUT", true);
    }
  }
  return failed("MODEL_REQUEST_FAILED", true);
}

export function createOpenRouterStructuredModel(
  options: CreateOpenRouterStructuredModelOptions,
): StructuredModel {
  const modelSlug = options.model.trim();
  if (modelSlug.length === 0) {
    throw new OpenRouterStructuredModelConfigurationError("MODEL_REQUIRED");
  }
  const createChatModel =
    options.createChatModel ??
    ((configuration) => new ChatOpenRouter(configuration) as unknown as OpenRouterChatModel);
  const timeout = options.timeoutMilliseconds ?? 60_000;

  return Object.freeze({
    descriptor: Object.freeze({ provider: "openrouter", model: modelSlug }),
    limits: Object.freeze({
      maximumInputCharacters: options.maximumInputCharacters ?? DEFAULT_MAXIMUM_INPUT_CHARACTERS,
    }),
    async generateStructured<Output>(
      request: StructuredModelRequest<Output>,
    ): Promise<StructuredModelResult<Output>> {
      // A key the store cannot produce is, from the run's point of view, a request that could
      // not be authenticated. Recording it as one keeps the failure inside the Agent Run the
      // operator is looking at rather than throwing out of a route as an unexplained 500, and it
      // is not retryable: nothing changes until somebody enters a key.
      let apiKey: string;
      try {
        apiKey = await options.resolveApiKey();
        if (apiKey.trim().length === 0) {
          throw new OpenRouterStructuredModelConfigurationError("OPENROUTER_API_KEY_REQUIRED");
        }
      } catch {
        return failed("MODEL_AUTHENTICATION_FAILED", false);
      }

      try {
        const chatModel = createChatModel({ apiKey, model: modelSlug, maxRetries: 0 });
        const structured = chatModel.withStructuredOutput(
          request.schema as ZodType<Record<string, unknown>>,
          { name: "storyrail_structured_response", strict: true },
        );
        const candidate = await structured.invoke(
          [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: JSON.stringify(request.input) },
          ],
          { timeout },
        );
        const parsed = request.schema.safeParse(candidate);
        return parsed.success
          ? { ok: true, output: parsed.data }
          : failed("MODEL_OUTPUT_INVALID", false);
      } catch (error) {
        return mapFailure(error);
      }
    },
  });
}
