import type { SiteId } from "@/domain/editorial";
import {
  createEvidencePreparationRuntimeFromEnvironment,
  type EvidencePreparationRuntime,
} from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type EvidencePreparationRuntimeFactory = (site: SiteId) => EvidencePreparationRuntime;

export type EvidencePreparationRuntimeProvider =
  SiteKeyedRuntimeProvider<EvidencePreparationRuntime>;

export function createEvidencePreparationRuntimeProvider(
  createRuntime: EvidencePreparationRuntimeFactory = (site) =>
    createEvidencePreparationRuntimeFromEnvironment({ siteId: site }),
): EvidencePreparationRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const evidencePreparationRuntimeProvider: EvidencePreparationRuntimeProvider =
  createEvidencePreparationRuntimeProvider();
