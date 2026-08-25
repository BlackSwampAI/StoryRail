import type { SiteId } from "@/domain/editorial";
import {
  createAssignmentEditorRuntimeFromEnvironment,
  type AssignmentEditorRuntime,
} from "@/runtime";

import {
  createSiteKeyedRuntimeProvider,
  type SiteKeyedRuntimeProvider,
} from "./site-keyed-runtime-provider";

export type AssignmentEditorRuntimeFactory = (site: SiteId) => AssignmentEditorRuntime;

export type AssignmentEditorRuntimeProvider = SiteKeyedRuntimeProvider<AssignmentEditorRuntime>;

export function createAssignmentEditorRuntimeProvider(
  createRuntime: AssignmentEditorRuntimeFactory = (site) =>
    createAssignmentEditorRuntimeFromEnvironment({ siteId: site }),
): AssignmentEditorRuntimeProvider {
  return createSiteKeyedRuntimeProvider(createRuntime);
}

export const assignmentEditorRuntimeProvider: AssignmentEditorRuntimeProvider =
  createAssignmentEditorRuntimeProvider();
