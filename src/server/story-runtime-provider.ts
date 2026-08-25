import type { SiteId } from "@/domain/editorial";
import { createStoryRuntimeFromEnvironment, type StoryRuntime } from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type StoryRuntimeFactory = (site: SiteId) => StoryRuntime;

export type StoryRuntimeProvider = SiteKeyedRuntimeProvider<StoryRuntime>;

export function createStoryRuntimeProvider(
  createRuntime: StoryRuntimeFactory = (site) =>
    createStoryRuntimeFromEnvironment({ siteId: site }),
): StoryRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const storyRuntimeProvider: StoryRuntimeProvider = createStoryRuntimeProvider();
