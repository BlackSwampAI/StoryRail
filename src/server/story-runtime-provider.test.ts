// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { StoryRuntime } from "@/runtime";

import { createStoryRuntimeProvider, type StoryRuntimeFactory } from "./story-runtime-provider";

function makeRuntime(): StoryRuntime {
  return Object.freeze({
    createStory: vi.fn<StoryRuntime["createStory"]>(),
    attachSourceToStory: vi.fn<StoryRuntime["attachSourceToStory"]>(),
    inspectStory: vi.fn<StoryRuntime["inspectStory"]>(),
    listStories: vi.fn<StoryRuntime["listStories"]>(),
    listPendingSources: vi.fn<StoryRuntime["listPendingSources"]>(),
    recordSourceTriageDecision: vi.fn<StoryRuntime["recordSourceTriageDecision"]>(),
    close: vi.fn<StoryRuntime["close"]>(async () => undefined),
  });
}

describe("createStoryRuntimeProvider", () => {
  it("constructs lazily once and returns the same provider-local runtime", () => {
    const runtime = makeRuntime();
    const factory = vi.fn<StoryRuntimeFactory>(() => runtime);
    const provider = createStoryRuntimeProvider(factory);

    expect(factory).not.toHaveBeenCalled();
    expect(provider.get()).toBe(runtime);
    expect(provider.get()).toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
    expect(runtime.createStory).not.toHaveBeenCalled();
    expect(runtime.attachSourceToStory).not.toHaveBeenCalled();
    expect(runtime.inspectStory).not.toHaveBeenCalled();
    expect(runtime.listStories).not.toHaveBeenCalled();
    expect(runtime.listPendingSources).not.toHaveBeenCalled();
    expect(runtime.recordSourceTriageDecision).not.toHaveBeenCalled();
    expect(runtime.close).not.toHaveBeenCalled();
    expect(Object.keys(provider)).toEqual(["get"]);
  });

  it("keeps separate instances in separate providers", () => {
    const first = makeRuntime();
    const second = makeRuntime();
    const firstProvider = createStoryRuntimeProvider(() => first);
    const secondProvider = createStoryRuntimeProvider(() => second);

    expect(firstProvider.get()).toBe(first);
    expect(secondProvider.get()).toBe(second);
    expect(firstProvider.get()).not.toBe(secondProvider.get());
  });

  it("does not cache a construction failure and permits retry", () => {
    const failure = new Error("controlled construction failure");
    const runtime = makeRuntime();
    const factory = vi
      .fn<StoryRuntimeFactory>()
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementationOnce(() => runtime);
    const provider = createStoryRuntimeProvider(factory);

    expect(() => provider.get()).toThrow(failure);
    expect(provider.get()).toBe(runtime);
    expect(provider.get()).toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
