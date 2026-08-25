// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId, type SiteId } from "@/domain/editorial";

import type { SiteDirectoryProvider } from "./site-directory-provider";
import { withSite } from "./site-route";

function directory(known: readonly string[]): SiteDirectoryProvider {
  const remembered = new Set(known);
  return Object.freeze({
    get: vi.fn(),
    exists: vi.fn(async (site: SiteId) => remembered.has(site)),
    remember: vi.fn((site: SiteId) => {
      remembered.add(site);
    }),
  });
}

describe("withSite", () => {
  it("refuses a Site this installation does not have before building anything for it", async () => {
    const buildHandler = vi.fn(() => vi.fn(async () => new Response("served")));
    const route = withSite(buildHandler, directory(["site-default"]));

    const response = await route(
      new Request("http://storyrail.test/api/sites/site-ghost/stories"),
      {
        params: Promise.resolve({ siteId: "site-ghost" }),
      },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "SITE_NOT_FOUND", message: expect.any(String) },
    });
    expect(buildHandler).not.toHaveBeenCalled();
  });

  it("serves a request from the Site named in the path", async () => {
    const handler = vi.fn(async () => new Response("served"));
    const buildHandler = vi.fn(() => handler);
    const route = withSite(buildHandler, directory(["site-default", "site-second"]));
    const request = new Request("http://storyrail.test/api/sites/site-second/stories");
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    const response = await route(request, context);

    expect(await response.text()).toBe("served");
    expect(buildHandler).toHaveBeenCalledWith(siteId("site-second"));
    expect(handler).toHaveBeenCalledWith(request, context);
  });

  it("keeps two Sites on two handlers rather than serving the second from the first", async () => {
    const served: string[] = [];
    const route = withSite(
      (site) => async () => {
        served.push(site);
        return new Response(site);
      },
      directory(["site-default", "site-second"]),
    );

    await route(new Request("http://storyrail.test/"), {
      params: Promise.resolve({ siteId: "site-default" }),
    });
    await route(new Request("http://storyrail.test/"), {
      params: Promise.resolve({ siteId: "site-second" }),
    });

    expect(served).toEqual(["site-default", "site-second"]);
  });
});
