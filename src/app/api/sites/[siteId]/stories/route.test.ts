// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(async () => true),
  createdHandler: vi.fn(async () => new Response("created")),
  createCreatedHandler: vi.fn(),
  listedHandler: vi.fn(async () => new Response("listed")),
  createListedHandler: vi.fn(),
}));

vi.mock("@/interfaces/http/create-story-handler", () => ({
  createCreateStoryHttpHandler: routeMocks.createCreatedHandler.mockReturnValue(
    routeMocks.createdHandler,
  ),
}));

vi.mock("@/interfaces/http/list-stories-handler", () => ({
  createListStoriesHttpHandler: routeMocks.createListedHandler.mockReturnValue(
    routeMocks.listedHandler,
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
  routeMocks.createdHandler.mockClear();
  routeMocks.createCreatedHandler.mockClear();
  routeMocks.listedHandler.mockClear();
  routeMocks.createListedHandler.mockClear();
});

describe("the Stories route", () => {
  it("exposes POST and GET on Node.js and builds nothing before a request arrives", () => {
    expect(route.runtime).toBe("nodejs");
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "runtime"]);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createCreatedHandler).not.toHaveBeenCalled();
    expect(routeMocks.createListedHandler).not.toHaveBeenCalled();
  });

  it("refuses a Site this installation does not have before any runtime is built", async () => {
    routeMocks.exists.mockResolvedValueOnce(false);

    const response = await route.POST(
      new Request("http://storyrail.test/api/sites/site-second/stories", { method: "POST" }),
      { params: Promise.resolve({ siteId: "site-nowhere" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "SITE_NOT_FOUND", message: expect.any(String) },
    });
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createCreatedHandler).not.toHaveBeenCalled();
    expect(routeMocks.createListedHandler).not.toHaveBeenCalled();
  });

  it("serves POST from the runtime of the Site named in the path", async () => {
    const request = new Request("http://storyrail.test/api/sites/site-second/stories", {
      method: "POST",
    });
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    await route.POST(request, context);

    expect(routeMocks.createdHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createCreatedHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });

  it("serves GET from the runtime of the Site named in the path", async () => {
    const request = new Request("http://storyrail.test/api/sites/site-second/stories", {
      method: "GET",
    });
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    await route.GET(request, context);

    expect(routeMocks.listedHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createListedHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });
});
