import {
  createAssignmentEditorRuntimeFromEnvironment,
  type AssignmentEditorRuntime,
} from "@/runtime";

export function createAssignmentEditorRuntimeProvider(
  createRuntime: () => AssignmentEditorRuntime = createAssignmentEditorRuntimeFromEnvironment,
) {
  let runtime: AssignmentEditorRuntime | undefined;
  return Object.freeze({
    get(): AssignmentEditorRuntime {
      runtime ??= createRuntime();
      return runtime;
    },
  });
}

export const assignmentEditorRuntimeProvider = createAssignmentEditorRuntimeProvider();
