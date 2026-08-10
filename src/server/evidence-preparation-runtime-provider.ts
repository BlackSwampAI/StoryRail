import {
  createEvidencePreparationRuntimeFromEnvironment,
  type EvidencePreparationRuntime,
} from "@/runtime";

export type EvidencePreparationRuntimeFactory = () => EvidencePreparationRuntime;

export function createEvidencePreparationRuntimeProvider(
  createRuntime: EvidencePreparationRuntimeFactory = createEvidencePreparationRuntimeFromEnvironment,
) {
  let runtime: EvidencePreparationRuntime | undefined;
  return Object.freeze({
    get(): EvidencePreparationRuntime {
      runtime ??= createRuntime();
      return runtime;
    },
  });
}

export const evidencePreparationRuntimeProvider = createEvidencePreparationRuntimeProvider();
