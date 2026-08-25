import type { SiteId } from "@/domain/editorial";
import { createResearcherRuntimeFromEnvironment, type ResearcherRuntime } from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type ResearcherRuntimeFactory = (site: SiteId) => ResearcherRuntime;

export type ResearcherRuntimeProvider = SiteKeyedRuntimeProvider<ResearcherRuntime>;

export function createResearcherRuntimeProvider(
  createRuntime: ResearcherRuntimeFactory = (site) =>
    createResearcherRuntimeFromEnvironment({ siteId: site }),
): ResearcherRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const researcherRuntimeProvider: ResearcherRuntimeProvider =
  createResearcherRuntimeProvider();
