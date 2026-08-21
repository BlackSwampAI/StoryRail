import type { ZodType } from "zod";

import type { ModelDescriptor, ModelFailureCode } from "@/domain/editorial";

export interface StructuredModelRequest<Output> {
  readonly systemPrompt: string;
  readonly input: unknown;
  readonly schema: ZodType<Output>;
}

export type StructuredModelResult<Output> =
  | { readonly ok: true; readonly output: Output }
  | {
      readonly ok: false;
      readonly failure: {
        readonly code: ModelFailureCode;
        readonly retryable: boolean;
      };
    };

/**
 * What this model boundary will accept, declared by the adapter that owns it. Providers differ
 * in context window, throughput, and cost, so callers ask the boundary rather than assuming a
 * figure measured against one provider.
 *
 * These are operational limits, not provenance. `ModelDescriptor` records what ran and is kept
 * forever; limits describe what the boundary accepts right now and are never persisted.
 */
export interface StructuredModelLimits {
  readonly maximumInputCharacters: number;
}

export interface StructuredModel {
  readonly descriptor: ModelDescriptor;
  readonly limits: StructuredModelLimits;
  generateStructured<Output>(
    request: StructuredModelRequest<Output>,
  ): Promise<StructuredModelResult<Output>>;
}
