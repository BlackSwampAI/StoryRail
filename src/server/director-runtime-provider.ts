import { createDirectorRuntimeFromEnvironment, type DirectorRuntime } from "@/runtime";

export function createDirectorRuntimeProvider(
  createRuntime: () => DirectorRuntime = createDirectorRuntimeFromEnvironment,
) {
  let runtime: DirectorRuntime | undefined;
  return Object.freeze({
    get(): DirectorRuntime {
      runtime ??= createRuntime();
      return runtime;
    },
  });
}

export const directorRuntimeProvider = createDirectorRuntimeProvider();
