// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => {
  const createdHandler = vi.fn(async () => new Response("delegated"));
  const get = vi.fn();
  const createHandler = vi.fn(() => createdHandler);

  return { createdHandler, get, createHandler };
});

vi.mock("@/interfaces/http/preserve-and-extract-url-source-handler", () => ({
  createPreserveAndExtractUrlSourceHttpHandler: routeMocks.createHandler,
}));

vi.mock("@/server/source-evidence-runtime-provider", () => ({
  sourceEvidenceRuntimeProvider: Object.freeze({ get: routeMocks.get }),
}));

let route: typeof import("./route");

beforeAll(async () => {
  route = await import("./route");
});

describe("Source-evidence URL Route Handler", () => {
  it("selects Node.js and constructs one handler with the exact production provider getter", () => {
    expect(route.runtime).toBe("nodejs");
    expect(routeMocks.createHandler).toHaveBeenCalledOnce();
    expect(routeMocks.createHandler).toHaveBeenCalledWith({ getRuntime: routeMocks.get });
    expect(routeMocks.get).not.toHaveBeenCalled();
  });

  it("exports POST as the exact created handler and delegates requests unchanged", async () => {
    const request = new Request("http://storyrail.test/api/source-evidence/url", {
      method: "POST",
    });

    expect(route.POST).toBe(routeMocks.createdHandler);

    const response = await route.POST(request);

    expect(response).toBeInstanceOf(Response);
    expect(routeMocks.createdHandler).toHaveBeenCalledOnce();
    expect(routeMocks.createdHandler).toHaveBeenCalledWith(request);
    expect(routeMocks.get).not.toHaveBeenCalled();
  });

  it("exports no unsupported methods or internal server dependencies", () => {
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
    expect(route).not.toHaveProperty("GET");
    expect(route).not.toHaveProperty("PUT");
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("DELETE");
    expect(route).not.toHaveProperty("runtimeProvider");
    expect(route).not.toHaveProperty("pool");
    expect(route).not.toHaveProperty("repositories");
    expect(route).not.toHaveProperty("configuration");
    expect(route).not.toHaveProperty("credentials");
  });
});
