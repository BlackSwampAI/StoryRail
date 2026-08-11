// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getHandler: vi.fn(async () => new Response("get")),
  postHandler: vi.fn(async () => new Response("post")),
  createGet: vi.fn(),
  createPost: vi.fn(),
}));

mocks.createGet.mockReturnValue(mocks.getHandler);
mocks.createPost.mockReturnValue(mocks.postHandler);

vi.mock("@/interfaces/http/list-agent-profiles-handler", () => ({
  createListAgentProfilesHttpHandler: mocks.createGet,
}));
vi.mock("@/interfaces/http/create-custom-writer-profile-handler", () => ({
  createCreateCustomWriterProfileHttpHandler: mocks.createPost,
}));
vi.mock("@/server/story-runtime-provider", () => ({
  storyRuntimeProvider: { get: mocks.get },
}));

let route: typeof import("./route");
beforeAll(async () => {
  route = await import("./route");
});

describe("Agent Profiles Route Handler", () => {
  it("wires Node.js GET and POST lazily", () => {
    expect(route.runtime).toBe("nodejs");
    expect(mocks.createGet).toHaveBeenCalledWith({ getRuntime: mocks.get });
    expect(mocks.createPost).toHaveBeenCalledWith({ getRuntime: mocks.get });
    expect(route.GET).toBe(mocks.getHandler);
    expect(route.POST).toBe(mocks.postHandler);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(Object.keys(route).sort()).toEqual(["GET", "POST", "runtime"]);
  });
});
