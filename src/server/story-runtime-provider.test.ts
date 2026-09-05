// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import { createStoryRuntimeProvider, type StoryRuntimeFactory } from "./story-runtime-provider";

function makeRuntime(): StoryRuntime {
  return Object.freeze({
    listNewsroomStandards: vi.fn() as never,
    setNewsroomStandards: vi.fn() as never,
    policyRuns: vi.fn() as never,
    reconcileAbandonedWork: vi.fn() as never,
    createStory: vi.fn<StoryRuntime["createStory"]>(),
    attachSourceToStory: vi.fn<StoryRuntime["attachSourceToStory"]>(),
    inspectStory: vi.fn<StoryRuntime["inspectStory"]>(),
    listStories: vi.fn<StoryRuntime["listStories"]>(),
    listPendingSources: vi.fn<StoryRuntime["listPendingSources"]>(),
    recordSourceTriageDecision: vi.fn<StoryRuntime["recordSourceTriageDecision"]>(),
    createCustomWriterProfile: vi.fn<StoryRuntime["createCustomWriterProfile"]>(),
    listAgentProfiles: vi.fn<StoryRuntime["listAgentProfiles"]>(),
    assignStory: vi.fn<StoryRuntime["assignStory"]>(),
    rejectStory: vi.fn<StoryRuntime["rejectStory"]>(),
    publishStory: vi.fn(),
    deliverStory: vi.fn<StoryRuntime["deliverStory"]>(),
    resolveLegacyDeliveryMapping: vi.fn<StoryRuntime["resolveLegacyDeliveryMapping"]>(),
    listStoryDeliveries: vi.fn<StoryRuntime["listStoryDeliveries"]>(),
    submitStoryReview: vi.fn<StoryRuntime["submitStoryReview"]>(),
    readSiteSettings: vi.fn<StoryRuntime["readSiteSettings"]>(),
    updateSiteSettings: vi.fn<StoryRuntime["updateSiteSettings"]>(),
    setSiteCredential: vi.fn<StoryRuntime["setSiteCredential"]>(),
    removeSiteCredential: vi.fn<StoryRuntime["removeSiteCredential"]>(),
    recordStoryReviewDecision: vi.fn<StoryRuntime["recordStoryReviewDecision"]>(),
    close: vi.fn<StoryRuntime["close"]>(async () => undefined),
  });
}

describe("createStoryRuntimeProvider", () => {
  const first = siteId("site-first");
  const second = siteId("site-second");

  it("constructs lazily once per Site and returns the same runtime for that Site", () => {
    const runtime = makeRuntime();
    const factory = vi.fn<StoryRuntimeFactory>(() => runtime);
    const provider = createStoryRuntimeProvider(factory);

    expect(factory).not.toHaveBeenCalled();
    expect(provider.get(first)).toBe(runtime);
    expect(provider.get(first)).toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
    expect(runtime.createStory).not.toHaveBeenCalled();
    expect(runtime.listStories).not.toHaveBeenCalled();
    expect(runtime.close).not.toHaveBeenCalled();
    expect(Object.keys(provider)).toEqual(["get"]);
  });

  it("serves two Sites from two runtimes", () => {
    const runtimes = new Map([
      [first, makeRuntime()],
      [second, makeRuntime()],
    ]);
    const provider = createStoryRuntimeProvider((site) => runtimes.get(site)!);

    expect(provider.get(first)).toBe(runtimes.get(first));
    expect(provider.get(second)).toBe(runtimes.get(second));
    expect(provider.get(first)).not.toBe(provider.get(second));
  });

  it("keeps separate instances in separate providers", () => {
    const one = makeRuntime();
    const other = makeRuntime();
    const firstProvider = createStoryRuntimeProvider(() => one);
    const secondProvider = createStoryRuntimeProvider(() => other);

    expect(firstProvider.get(first)).toBe(one);
    expect(secondProvider.get(first)).toBe(other);
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

    expect(() => provider.get(first)).toThrow(failure);
    expect(provider.get(first)).toBe(runtime);
    expect(provider.get(first)).toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(2);
  });
});
