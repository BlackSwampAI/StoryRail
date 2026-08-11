import { describe, expect, it, vi } from "vitest";

import type { AssignmentEditorRuntime } from "@/runtime";

import { createAssignmentEditorRuntimeProvider } from "./assignment-editor-runtime-provider";

describe("Assignment Editor runtime provider", () => {
  it("constructs once and only when requested", () => {
    const runtime = {
      generateAssignmentProposal: vi.fn(),
      close: vi.fn(),
    } as AssignmentEditorRuntime;
    const factory = vi.fn(() => runtime);
    const provider = createAssignmentEditorRuntimeProvider(factory);
    expect(factory).not.toHaveBeenCalled();
    expect(provider.get()).toBe(runtime);
    expect(provider.get()).toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
  });
});
