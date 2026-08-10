// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const createdHandler = vi.fn(async () => new Response("delegated"));
  const listedHandler = vi.fn(async () => new Response("listed"));
  const get = vi.fn();
  const createHandler = vi.fn(() => createdHandler);
  const listHandler = vi.fn(() => listedHandler);
  return { createdHandler, listedHandler, get, createHandler, listHandler };
});

vi.mock("@/interfaces/http/create-story-handler", () => ({
  createCreateStoryHttpHandler: routeMocks.createHandler,
}));

vi.mock("@/interfaces/http/list-stories-handler", () => ({
  createListStoriesHttpHandler: routeMocks.listHandler,
}));

vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

describe("Stories Route Handler", () => {
  it("selects Node.js and wires GET and POST without eager provider access", () => {
    expect(route.runtime).toBe("nodejs");
    expect(routeMocks.createHandler).toHaveBeenCalledOnce();
    expect(routeMocks.createHandler).toHaveBeenCalledWith({ getRuntime: routeMocks.get });
    expect(route.POST).toBe(routeMocks.createdHandler);
    expect(routeMocks.listHandler).toHaveBeenCalledOnce();
    expect(routeMocks.listHandler).toHaveBeenCalledWith({ getRuntime: routeMocks.get });
    expect(route.GET).toBe(routeMocks.listedHandler);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "runtime"]);
  });

  it("delegates the request unchanged", async () => {
    const request = new Request("http://storyrail.test/api/stories", { method: "POST" });
    await route.POST(request);
    expect(routeMocks.createdHandler).toHaveBeenCalledWith(request);
  });

  it("delegates GET unchanged", async () => {
    const request = new Request("http://storyrail.test/api/stories", { method: "GET" });
    await route.GET(request);
    expect(routeMocks.listedHandler).toHaveBeenCalledWith(request);
  });
});
