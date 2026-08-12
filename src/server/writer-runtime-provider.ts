import { createWriterRuntimeFromEnvironment, type WriterRuntime } from "@/runtime";

export function createWriterRuntimeProvider(
  createRuntime: () => WriterRuntime = createWriterRuntimeFromEnvironment,
) {
  let runtime: WriterRuntime | undefined;
  return Object.freeze({
    get(): WriterRuntime {
      runtime ??= createRuntime();
      return runtime;
    },
  });
}

export const writerRuntimeProvider = createWriterRuntimeProvider();
