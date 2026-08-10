import type { ZodType } from "zod";

import type { ModelDescriptor, PreparationFailureCode } from "@/domain/editorial";

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
        readonly code: PreparationFailureCode;
        readonly retryable: boolean;
      };
    };

export interface StructuredModel {
  readonly descriptor: ModelDescriptor;
  generateStructured<Output>(
    request: StructuredModelRequest<Output>,
  ): Promise<StructuredModelResult<Output>>;
}
