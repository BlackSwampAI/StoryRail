// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";
import type { SourceEvidenceRuntime } from "@/runtime";

import {
  createSourceEvidenceRuntimeProvider,
  type SourceEvidenceRuntimeFactory,
  type SourceEvidenceRuntimeProvider,
} from "./source-evidence-runtime-provider";

const SITE_ID = siteId("site-provider");

function makeRuntime(label: string): SourceEvidenceRuntime & {
  readonly label: string;
  readonly preserveUrlSource: ReturnType<typeof vi.fn<SourceEvidenceRuntime["preserveUrlSource"]>>;
  readonly extractPersistedSource: ReturnType<
    typeof vi.fn<SourceEvidenceRuntime["extractPersistedSource"]>
  >;
  readonly preserveAndExtractUrlSource: ReturnType<
    typeof vi.fn<SourceEvidenceRuntime["preserveAndExtractUrlSource"]>
  >;
  readonly close: ReturnType<typeof vi.fn<SourceEvidenceRuntime["close"]>>;
} {
  return Object.freeze({
    label,
    preserveUrlSource: vi.fn<SourceEvidenceRuntime["preserveUrlSource"]>(),
    extractPersistedSource: vi.fn<SourceEvidenceRuntime["extractPersistedSource"]>(),
    preserveAndExtractUrlSource: vi.fn<SourceEvidenceRuntime["preserveAndExtractUrlSource"]>(),
    close: vi.fn<SourceEvidenceRuntime["close"]>(async () => undefined),
  });
}

describe("createSourceEvidenceRuntimeProvider", () => {
  it("exposes the public factory and provider contracts while construction remains inert", () => {
    const runtime = makeRuntime("inert");
    const factory: SourceEvidenceRuntimeFactory = vi.fn(() => runtime);
    const provider: SourceEvidenceRuntimeProvider = createSourceEvidenceRuntimeProvider(factory);

    expect(createSourceEvidenceRuntimeProvider).toBeTypeOf("function");
    expect(provider.get).toBeTypeOf("function");
    expect(factory).not.toHaveBeenCalled();
    expect(runtime.preserveUrlSource).not.toHaveBeenCalled();
    expect(runtime.extractPersistedSource).not.toHaveBeenCalled();
    expect(runtime.preserveAndExtractUrlSource).not.toHaveBeenCalled();
    expect(runtime.close).not.toHaveBeenCalled();
  });

  it("constructs lazily once and returns the exact cached runtime by reference", () => {
    const runtime = makeRuntime("cached");
    const factory = vi.fn<SourceEvidenceRuntimeFactory>(() => runtime);
    const provider = createSourceEvidenceRuntimeProvider(factory);

    expect(factory).not.toHaveBeenCalled();

    const first = provider.get(SITE_ID);
    const second = provider.get(SITE_ID);
    const third = provider.get(SITE_ID);

    expect(first).toBe(runtime);
    expect(second).toBe(runtime);
    expect(third).toBe(runtime);
    expect(factory).toHaveBeenCalledOnce();
  });

  it("keeps separate cached runtimes in separate provider instances", () => {
    const firstRuntime = makeRuntime("first");
    const secondRuntime = makeRuntime("second");
    const firstFactory = vi.fn<SourceEvidenceRuntimeFactory>(() => firstRuntime);
    const secondFactory = vi.fn<SourceEvidenceRuntimeFactory>(() => secondRuntime);
    const firstProvider = createSourceEvidenceRuntimeProvider(firstFactory);
    const secondProvider = createSourceEvidenceRuntimeProvider(secondFactory);

    expect(firstProvider.get(SITE_ID)).toBe(firstRuntime);
    expect(secondProvider.get(SITE_ID)).toBe(secondRuntime);
    expect(firstProvider.get(SITE_ID)).not.toBe(secondProvider.get(SITE_ID));
    expect(firstFactory).toHaveBeenCalledOnce();
    expect(secondFactory).toHaveBeenCalledOnce();
  });

  it("propagates construction failure unchanged, does not cache it, and permits retry", () => {
    const failure = new Error("controlled runtime construction failure");
    const runtime = makeRuntime("retry");
    const factory = vi
      .fn<SourceEvidenceRuntimeFactory>()
      .mockImplementationOnce(() => {
        throw failure;
      })
      .mockImplementationOnce(() => runtime);
    const provider = createSourceEvidenceRuntimeProvider(factory);

    expect(() => provider.get(SITE_ID)).toThrow(failure);
    expect(factory).toHaveBeenCalledTimes(1);
    expect(provider.get(SITE_ID)).toBe(runtime);
    expect(provider.get(SITE_ID)).toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("never invokes workflows or close and exposes only the getter", () => {
    const runtime = makeRuntime("surface");
    const provider = createSourceEvidenceRuntimeProvider(() => runtime);

    provider.get(SITE_ID);
    provider.get(SITE_ID);

    expect(runtime.preserveUrlSource).not.toHaveBeenCalled();
    expect(runtime.extractPersistedSource).not.toHaveBeenCalled();
    expect(runtime.preserveAndExtractUrlSource).not.toHaveBeenCalled();
    expect(runtime.close).not.toHaveBeenCalled();
    expect(Object.keys(provider)).toEqual(["get"]);
    expect(provider).not.toHaveProperty("runtime");
    expect(provider).not.toHaveProperty("pool");
    expect(provider).not.toHaveProperty("repositories");
    expect(provider).not.toHaveProperty("configuration");
    expect(provider).not.toHaveProperty("credentials");
    expect(provider).not.toHaveProperty("connectionString");
  });
});
