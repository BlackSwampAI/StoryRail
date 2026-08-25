import type { SiteId } from "@/domain/editorial";
import { createDirectorRuntimeFromEnvironment, type DirectorRuntime } from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type DirectorRuntimeFactory = (site: SiteId) => DirectorRuntime;

export type DirectorRuntimeProvider = SiteKeyedRuntimeProvider<DirectorRuntime>;

export function createDirectorRuntimeProvider(
  createRuntime: DirectorRuntimeFactory = (site) =>
    createDirectorRuntimeFromEnvironment({ siteId: site }),
): DirectorRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const directorRuntimeProvider: DirectorRuntimeProvider = createDirectorRuntimeProvider();
