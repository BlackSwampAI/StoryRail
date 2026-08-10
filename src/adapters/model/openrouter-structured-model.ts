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
import type { PreparationFailureCode } from "@/domain/editorial";

interface StructuredRunnable {
  invoke(input: unknown, options?: { readonly timeout?: number }): Promise<unknown>;
}

interface OpenRouterChatModel {
  withStructuredOutput(
    schema: ZodType<Record<string, unknown>>,
    options: { readonly name: string; readonly strict: true },
  ): StructuredRunnable;
}

export interface CreateOpenRouterStructuredModelOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMilliseconds?: number;
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

function failed<Output>(
  code: PreparationFailureCode,
  retryable: boolean,
): StructuredModelResult<Output> {
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
  if (options.apiKey.trim().length === 0) {
    throw new OpenRouterStructuredModelConfigurationError("OPENROUTER_API_KEY_REQUIRED");
  }
  const modelSlug = options.model.trim();
  if (modelSlug.length === 0) {
    throw new OpenRouterStructuredModelConfigurationError("MODEL_REQUIRED");
  }
  const createChatModel =
    options.createChatModel ??
    ((configuration) => new ChatOpenRouter(configuration) as unknown as OpenRouterChatModel);
  const chatModel = createChatModel({ apiKey: options.apiKey, model: modelSlug, maxRetries: 0 });
  const timeout = options.timeoutMilliseconds ?? 60_000;

  return Object.freeze({
    descriptor: Object.freeze({ provider: "openrouter", model: modelSlug }),
    async generateStructured<Output>(
      request: StructuredModelRequest<Output>,
    ): Promise<StructuredModelResult<Output>> {
      try {
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
