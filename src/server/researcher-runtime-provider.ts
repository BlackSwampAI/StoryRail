import { createResearcherRuntimeFromEnvironment, type ResearcherRuntime } from "@/runtime";

export function createResearcherRuntimeProvider(
  createRuntime: () => ResearcherRuntime = createResearcherRuntimeFromEnvironment,
) {
  let runtime: ResearcherRuntime | undefined;
  return Object.freeze({
    get(): ResearcherRuntime {
      runtime ??= createRuntime();
      return runtime;
    },
  });
}

export const researcherRuntimeProvider = createResearcherRuntimeProvider();
