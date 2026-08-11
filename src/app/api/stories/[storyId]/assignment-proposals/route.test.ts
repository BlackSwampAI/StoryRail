// @vitest-environment node

import { beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  handler: vi.fn(async () => new Response("delegated")),
  create: vi.fn(),
}));
mocks.create.mockReturnValue(mocks.handler);
vi.mock("@/interfaces/http/generate-assignment-proposal-handler", () => ({
  createGenerateAssignmentProposalHttpHandler: mocks.create,
}));
vi.mock("@/server/assignment-editor-runtime-provider", () => ({
  assignmentEditorRuntimeProvider: { get: mocks.get },
}));

let route: typeof import("./route");
beforeAll(async () => {
  route = await import("./route");
});

describe("Assignment proposal Route Handler", () => {
  it("wires only a lazy Node.js POST", () => {
    expect(route.runtime).toBe("nodejs");
    expect(mocks.create).toHaveBeenCalledWith({ getRuntime: mocks.get });
    expect(route.POST).toBe(mocks.handler);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(Object.keys(route).sort()).toEqual(["POST", "runtime"]);
  });
});
