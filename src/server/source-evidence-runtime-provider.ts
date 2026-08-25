import type { SiteId } from "@/domain/editorial";
import { createSourceEvidenceRuntimeFromEnvironment, type SourceEvidenceRuntime } from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type SourceEvidenceRuntimeFactory = (site: SiteId) => SourceEvidenceRuntime;

export type SourceEvidenceRuntimeProvider = SiteKeyedRuntimeProvider<SourceEvidenceRuntime>;

export function createSourceEvidenceRuntimeProvider(
  createRuntime: SourceEvidenceRuntimeFactory = (site) =>
    createSourceEvidenceRuntimeFromEnvironment({ siteId: site }),
): SourceEvidenceRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const sourceEvidenceRuntimeProvider: SourceEvidenceRuntimeProvider =
  createSourceEvidenceRuntimeProvider();
