import type { SiteId } from "@/domain/editorial";
import { createWriterRuntimeFromEnvironment, type WriterRuntime } from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type WriterRuntimeFactory = (site: SiteId) => WriterRuntime;

export type WriterRuntimeProvider = SiteKeyedRuntimeProvider<WriterRuntime>;

export function createWriterRuntimeProvider(
  createRuntime: WriterRuntimeFactory = (site) =>
    createWriterRuntimeFromEnvironment({ siteId: site }),
): WriterRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const writerRuntimeProvider: WriterRuntimeProvider = createWriterRuntimeProvider();
