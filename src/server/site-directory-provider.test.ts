// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";
import type { SiteDirectoryRuntime } from "@/runtime";

import { createSiteDirectoryProvider } from "./site-directory-provider";

const SITE: Site = {
  id: siteId("site-second"),
  name: "Second Newsroom",
  domain: "second.example",
  description: "A second newsroom.",
};

function runtime(sites: readonly Site[]): SiteDirectoryRuntime {
  return Object.freeze({
    findSite: vi.fn(async (id) => sites.find((site) => site.id === id) ?? null),
    listSites: vi.fn(async () => sites),
    createSite: vi.fn(),
    close: vi.fn(async () => undefined),
  }) as unknown as SiteDirectoryRuntime;
}

describe("the Site directory provider", () => {
  it("builds the directory once and only when it is first needed", () => {
    const create = vi.fn(() => runtime([SITE]));
    const provider = createSiteDirectoryProvider(create);

    expect(create).not.toHaveBeenCalled();
    expect(provider.get()).toBe(provider.get());
    expect(create).toHaveBeenCalledOnce();
  });

  it("asks the database only once for a Site it has already found", async () => {
    const directory = runtime([SITE]);
    const provider = createSiteDirectoryProvider(() => directory);

    expect(await provider.exists(SITE.id)).toBe(true);
    expect(await provider.exists(SITE.id)).toBe(true);
    expect(directory.findSite).toHaveBeenCalledOnce();
  });

  it("never remembers a Site it did not find, so an unknown path cannot grow the cache", async () => {
    const directory = runtime([SITE]);
    const provider = createSiteDirectoryProvider(() => directory);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(await provider.exists(siteId(`site-ghost-${attempt}`))).toBe(false);
    }

    expect(directory.findSite).toHaveBeenCalledTimes(5);
  });

  it("answers for a Site created in this process without another lookup", async () => {
    const directory = runtime([]);
    const provider = createSiteDirectoryProvider(() => directory);

    provider.remember(SITE.id);

    expect(await provider.exists(SITE.id)).toBe(true);
    expect(directory.findSite).not.toHaveBeenCalled();
  });
});
