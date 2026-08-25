// @vitest-environment node

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  get: vi.fn(),
  exists: vi.fn(async () => true),
  proposalHandler: vi.fn(async () => new Response("proposed")),
  createProposalHandler: vi.fn(),
}));

vi.mock("@/interfaces/http/generate-assignment-proposal-handler", () => ({
  createGenerateAssignmentProposalHttpHandler: routeMocks.createProposalHandler.mockReturnValue(
    routeMocks.proposalHandler,
  ),
}));

vi.mock("@/server/assignment-editor-runtime-provider", () => ({
  assignmentEditorRuntimeProvider: Object.freeze({ get: routeMocks.get }),
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
  routeMocks.proposalHandler.mockClear();
  routeMocks.createProposalHandler.mockClear();
});

describe("the assignment proposal route", () => {
  it("exposes POST on Node.js and builds nothing before a request arrives", () => {
    expect(route.runtime).toBe("nodejs");
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createProposalHandler).not.toHaveBeenCalled();
  });

  it("refuses a Site this installation does not have before any runtime is built", async () => {
    routeMocks.exists.mockResolvedValueOnce(false);

    const response = await route.POST(
      new Request(
        "http://storyrail.test/api/sites/site-second/stories/story-route-0020/assignment-proposals",
        { method: "POST" },
      ),
      { params: Promise.resolve({ siteId: "site-nowhere", storyId: "story-route-0020" }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "SITE_NOT_FOUND", message: expect.any(String) },
    });
    expect(routeMocks.get).not.toHaveBeenCalled();
    expect(routeMocks.createProposalHandler).not.toHaveBeenCalled();
  });

  it("serves POST from the runtime of the Site named in the path", async () => {
    const request = new Request(
      "http://storyrail.test/api/sites/site-second/stories/story-route-0020/assignment-proposals",
      { method: "POST" },
    );
    const context = {
      params: Promise.resolve({ siteId: "site-second", storyId: "story-route-0020" }),
    };

    await route.POST(request, context);

    expect(routeMocks.proposalHandler).toHaveBeenCalledWith(request, context);
    // The handler is handed a getter rather than a runtime, so the Site it was bound to
    // only shows when that getter is used.
    routeMocks.createProposalHandler.mock.calls[0]?.[0].getRuntime();
    expect(routeMocks.get).toHaveBeenCalledWith("site-second");
  });
});
