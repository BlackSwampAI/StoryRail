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

/**
 * A tool as declared to a model. JSON Schema rather than a Zod type, because a tool need not be
 * written in this codebase: an operator's own tool, or one reached through a server that
 * describes its capabilities at runtime, declares itself in the same terms as a built-in one.
 */
export interface ToolDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ModelToolRequest {
  /** The provider's identifier for this call, needed to return its result to the right place. */
  readonly callId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

/** What has happened so far in a tool-assisted exchange, in the order it happened. */
export type ToolTranscriptEntry =
  | { readonly kind: "requested"; readonly calls: readonly ModelToolRequest[] }
  | { readonly kind: "resolved"; readonly callId: string; readonly content: string };

export type ToolAssistedTurn<Output> =
  | { readonly kind: "output"; readonly output: Output }
  | { readonly kind: "tools"; readonly calls: readonly ModelToolRequest[] };

export interface ToolAssistedRequest<Output> extends StructuredModelRequest<Output> {
  readonly tools: readonly ToolDeclaration[];
  readonly transcript: readonly ToolTranscriptEntry[];
}

/**
 * A model that can be offered tools. Declared as a capability rather than assumed, because
 * provider support varies and a run that needs tools should fail on a model that cannot use
 * them rather than silently answering without them.
 */
export interface ToolAssistedModel extends StructuredModel {
  readonly supportsTools: true;
  generateWithTools<Output>(
    request: ToolAssistedRequest<Output>,
  ): Promise<StructuredModelResult<ToolAssistedTurn<Output>>>;
}

export function supportsTools(model: StructuredModel): model is ToolAssistedModel {
  return (model as Partial<ToolAssistedModel>).supportsTools === true;
}
