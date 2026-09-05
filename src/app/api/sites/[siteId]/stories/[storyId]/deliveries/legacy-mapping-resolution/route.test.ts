// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(async () => true),
  handler: vi.fn(async () => new Response("resolved")),
  createHandler: vi.fn(),
}));

vi.mock("@/interfaces/http/resolve-legacy-delivery-mapping-handler", () => ({
  createResolveLegacyDeliveryMappingHttpHandler: routeMocks.createHandler.mockReturnValue(
    routeMocks.handler,
  ),
}));
vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));
vi.mock("@/server/site-directory-provider", () => ({
  siteDirectoryProvider: Object.freeze({
    get: vi.fn(),
    exists: routeMocks.exists,
    remember: vi.fn(),
  }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

beforeEach(() => {
  routeMocks.exists.mockClear();
  routeMocks.get.mockClear();
  routeMocks.handler.mockClear();
  routeMocks.createHandler.mockClear();
});

describe("the legacy delivery mapping resolution route", () => {
  it("exposes POST on Node.js and builds nothing before a request", () => {
    expect(route.runtime).toBe("nodejs");
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
    expect(routeMocks.get).not.toHaveBeenCalled();
  });

  it("refuses an unknown Site before building a runtime", async () => {
    routeMocks.exists.mockResolvedValueOnce(false);
    const response = await route.POST(new Request("http://storyrail.test", { method: "POST" }), {
      params: Promise.resolve({ siteId: "site-nowhere", storyId: "story-1" }),
    });

    expect(response.status).toBe(404);
    expect(routeMocks.get).not.toHaveBeenCalled();
  });

  it("serves POST from the Site runtime named in the path", async () => {
    const request = new Request("http://storyrail.test", { method: "POST" });
    const context = { params: Promise.resolve({ siteId: "site-2", storyId: "story-1" }) };
    await route.POST(request, context);

    expect(routeMocks.handler).toHaveBeenCalledWith(request, context);
    routeMocks.createHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-2");
  });
});
