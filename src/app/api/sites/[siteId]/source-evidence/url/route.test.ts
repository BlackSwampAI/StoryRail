// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(async () => true),
  preserveHandler: vi.fn(async () => new Response("preserved")),
  createPreserveHandler: vi.fn(),
}));

vi.mock("@/interfaces/http/preserve-and-extract-url-source-handler", () => ({
  createPreserveAndExtractUrlSourceHttpHandler: routeMocks.createPreserveHandler.mockReturnValue(
    routeMocks.preserveHandler,
  ),
}));

vi.mock("@/server/source-evidence-runtime-provider", () => ({
  sourceEvidenceRuntimeProvider: Object.freeze({ get: routeMocks.get }),
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
  routeMocks.preserveHandler.mockClear();
  routeMocks.createPreserveHandler.mockClear();
});

describe("the Source evidence URL route", () => {
  it("exposes POST on Node.js and builds nothing before a request arrives", () => {
    expect(route.runtime).toBe("nodejs");
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createPreserveHandler).not.toHaveBeenCalled();
  });

  it("refuses a Site this installation does not have before any runtime is built", async () => {
    routeMocks.exists.mockResolvedValueOnce(false);

    const response = await route.POST(
      new Request("http://storyrail.test/api/sites/site-second/source-evidence/url", {
        method: "POST",
      }),
      { params: Promise.resolve({ siteId: "site-nowhere" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "SITE_NOT_FOUND", message: expect.any(String) },
    });
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createPreserveHandler).not.toHaveBeenCalled();
  });

  it("serves POST from the runtime of the Site named in the path", async () => {
    const request = new Request("http://storyrail.test/api/sites/site-second/source-evidence/url", {
      method: "POST",
    });
    const context = { params: Promise.resolve({ siteId: "site-second" }) };

    await route.POST(request, context);

    expect(routeMocks.preserveHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createPreserveHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });
});
