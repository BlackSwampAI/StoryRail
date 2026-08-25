import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";
import type { AssignmentEditorRuntime } from "@/runtime";

import { createAssignmentEditorRuntimeProvider } from "./assignment-editor-runtime-provider";

describe("Assignment Editor runtime provider", () => {
  it("constructs once per Site and only when requested", () => {
    const runtime = {
      generateAssignmentProposal: vi.fn(),
      close: vi.fn(),
    } as AssignmentEditorRuntime;
    const factory = vi.fn(() => runtime);
    const provider = createAssignmentEditorRuntimeProvider(factory);
    expect(factory).not.toHaveBeenCalled();
    expect(provider.get(siteId("site-first"))).toBe(runtime);
    expect(provider.get(siteId("site-first"))).toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
    provider.get(siteId("site-second"));
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
