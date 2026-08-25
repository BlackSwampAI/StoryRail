// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const setHandler = vi.fn(async () => new Response("set"));
  const removeHandler = vi.fn(async () => new Response("removed"));
  const get = vi.fn();
  return {
    setHandler,
    removeHandler,
    get,
    createSet: vi.fn(() => setHandler),
    createRemove: vi.fn(() => removeHandler),
  };
});

vi.mock("@/interfaces/http/site-settings-handlers", () => ({
  createSetSiteCredentialHttpHandler: routeMocks.createSet,
  createRemoveSiteCredentialHttpHandler: routeMocks.createRemove,
}));

vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

describe("the per-Site credential route", () => {
  it("offers writing and removing a credential and no way to read one", () => {
    expect(Object.keys(route).sort()).toEqual(["DELETE", "PUT", "runtime"]);
    expect(route).not.toHaveProperty("GET");
    expect(route.runtime).toBe("nodejs");
    expect(routeMocks.get).not.toHaveBeenCalled();
  });
});
