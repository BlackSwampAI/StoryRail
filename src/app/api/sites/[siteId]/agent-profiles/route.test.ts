// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(async () => true),
  listHandler: vi.fn(async () => new Response("listed")),
  createListHandler: vi.fn(),
  createProfileHandler: vi.fn(async () => new Response("created")),
  createCreateProfileHandler: vi.fn(),
}));

vi.mock("@/interfaces/http/list-agent-profiles-handler", () => ({
  createListAgentProfilesHttpHandler: routeMocks.createListHandler.mockReturnValue(
    routeMocks.listHandler,
  ),
}));

vi.mock("@/interfaces/http/create-custom-writer-profile-handler", () => ({
  createCreateCustomWriterProfileHttpHandler: routeMocks.createCreateProfileHandler.mockReturnValue(
    routeMocks.createProfileHandler,
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
  routeMocks.listHandler.mockClear();
  routeMocks.createListHandler.mockClear();
  routeMocks.createProfileHandler.mockClear();
  routeMocks.createCreateProfileHandler.mockClear();
});

describe("the Agent Profiles route", () => {
  it("exposes GET and POST on Node.js and builds nothing before a request arrives", () => {
    expect(route.runtime).toBe("nodejs");
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "runtime"]);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createListHandler).not.toHaveBeenCalled();
    expect(routeMocks.createCreateProfileHandler).not.toHaveBeenCalled();
  });

  it("refuses a Site this installation does not have before any runtime is built", async () => {
    routeMocks.exists.mockResolvedValueOnce(false);

    const response = await route.GET(
      new Request("http://storyrail.test/api/sites/site-second/agent-profiles", {
        method: "GET",
      }),
      { params: Promise.resolve({ siteId: "site-nowhere" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "SITE_NOT_FOUND", message: expect.any(String) },
    });
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createListHandler).not.toHaveBeenCalled();
    expect(routeMocks.createCreateProfileHandler).not.toHaveBeenCalled();
  });

  it("serves GET from the runtime of the Site named in the path", async () => {
    const request = new Request("http://storyrail.test/api/sites/site-second/agent-profiles", {
      method: "GET",
    });
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    await route.GET(request, context);

    expect(routeMocks.listHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createListHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });

  it("serves POST from the runtime of the Site named in the path", async () => {
    const request = new Request("http://storyrail.test/api/sites/site-second/agent-profiles", {
      method: "POST",
    });
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    await route.POST(request, context);

    expect(routeMocks.createProfileHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createCreateProfileHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });
});
