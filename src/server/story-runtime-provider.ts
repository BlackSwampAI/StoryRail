import { createStoryRuntimeFromEnvironment, type StoryRuntime } from "@/runtime";

export type StoryRuntimeFactory = () => StoryRuntime;

export interface StoryRuntimeProvider {
  get(): StoryRuntime;
}

export function createStoryRuntimeProvider(
  createRuntime: StoryRuntimeFactory = createStoryRuntimeFromEnvironment,
): StoryRuntimeProvider {
  let runtime: StoryRuntime | undefined;

  return Object.freeze({
    get(): StoryRuntime {
      if (runtime === undefined) {
        runtime = createRuntime();
      }

      return runtime;
    },
  });
}

export const storyRuntimeProvider: StoryRuntimeProvider = createStoryRuntimeProvider();
