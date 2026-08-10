// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const createdHandler = vi.fn(async () => new Response("delegated"));
  const get = vi.fn();
  const createHandler = vi.fn(() => createdHandler);
  return { createdHandler, get, createHandler };
});

vi.mock("@/interfaces/http/create-story-handler", () => ({
  createCreateStoryHttpHandler: routeMocks.createHandler,
}));

vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

describe("Story creation Route Handler", () => {
  it("selects Node.js and wires POST to the production Story provider without eager access", () => {
    expect(route.runtime).toBe("nodejs");
    expect(routeMocks.createHandler).toHaveBeenCalledOnce();
    expect(routeMocks.createHandler).toHaveBeenCalledWith({ getRuntime: routeMocks.get });
    expect(route.POST).toBe(routeMocks.createdHandler);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
  });

  it("delegates the request unchanged", async () => {
    const request = new Request("http://storyrail.test/api/stories", { method: "POST" });
    await route.POST(request);
    expect(routeMocks.createdHandler).toHaveBeenCalledWith(request);
  });
});
