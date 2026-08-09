import { createSourceEvidenceRuntimeFromEnvironment, type SourceEvidenceRuntime } from "@/runtime";

export type SourceEvidenceRuntimeFactory = () => SourceEvidenceRuntime;

export interface SourceEvidenceRuntimeProvider {
  get(): SourceEvidenceRuntime;
}

export function createSourceEvidenceRuntimeProvider(
  createRuntime: SourceEvidenceRuntimeFactory = createSourceEvidenceRuntimeFromEnvironment,
): SourceEvidenceRuntimeProvider {
  let runtime: SourceEvidenceRuntime | undefined;

  return Object.freeze({
    get(): SourceEvidenceRuntime {
      if (runtime === undefined) {
        runtime = createRuntime();
      }

      return runtime;
    },
  });
}

export const sourceEvidenceRuntimeProvider: SourceEvidenceRuntimeProvider =
  createSourceEvidenceRuntimeProvider();
