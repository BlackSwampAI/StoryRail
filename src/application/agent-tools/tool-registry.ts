import type { ToolDeclaration } from "@/application/model";
import type { JsonValue, ToolFailureCode } from "@/domain/editorial";

export type { ToolDeclaration };

export type ToolExecutionResult =
  | {
      readonly ok: true;
      /** The audit fact: small, durable, and not a copy of what was retrieved. */
      readonly record: JsonValue;
      /**
       * What the model is shown. Kept apart from the record because retrieved material can be
       * large and belongs in evidence with its own immutable record, not in an audit row.
       */
      readonly content: string;
    }
  | {
      readonly ok: false;
      readonly failure: {
        readonly code: ToolFailureCode;
        readonly retryable: boolean;
        readonly message: string | null;
      };
    };

export interface EditorialTool {
  readonly declaration: ToolDeclaration;
  execute(request: { readonly [key: string]: JsonValue }): Promise<ToolExecutionResult>;
}

/**
 * The tools available to a run. Open by construction: the runtime composes what an operator has
 * granted, and nothing in the domain or the loop needs to know which tools exist.
 */
export interface ToolRegistry {
  readonly declarations: readonly ToolDeclaration[];
  find(name: string): EditorialTool | undefined;
}

export function createToolRegistry(tools: readonly EditorialTool[]): ToolRegistry {
  const byName = new Map(tools.map((tool) => [tool.declaration.name, tool]));
  return Object.freeze({
    declarations: Object.freeze(tools.map((tool) => tool.declaration)),
    find: (name: string) => byName.get(name),
  });
}
