// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const createdHandler = vi.fn(async () => new Response("delegated"));
  const get = vi.fn();
  const createHandler = vi.fn(() => createdHandler);
  return { createdHandler, get, createHandler };
});

vi.mock("@/interfaces/http/inspect-story-handler", () => ({
  createInspectStoryHttpHandler: routeMocks.createHandler,
}));

vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

describe("Story inspection Route Handler", () => {
  it("selects Node.js and wires GET to the production Story provider without eager access", () => {
    expect(route.runtime).toBe("nodejs");
    expect(routeMocks.createHandler).toHaveBeenCalledOnce();
    expect(routeMocks.createHandler).toHaveBeenCalledWith({ getRuntime: routeMocks.get });
    expect(route.GET).toBe(routeMocks.createdHandler);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(Object.keys(route).sort()).toEqual(["GET", "runtime"]);
  });

  it("delegates the request and promise-based route context unchanged", async () => {
    const request = new Request("http://storyrail.test/api/stories/story-route-0020");
    const context = { params: Promise.resolve({ storyId: "story-route-0020" }) };
    await route.GET(request, context);
    expect(routeMocks.createdHandler).toHaveBeenCalledWith(request, context);
  });
});
