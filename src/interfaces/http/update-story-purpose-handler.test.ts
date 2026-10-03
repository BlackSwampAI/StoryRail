import { describe, expect, it, vi } from "vitest";

import type { StoryRuntime } from "@/runtime";
import { createUpdateStoryPurposeHttpHandler } from "./update-story-purpose-handler";

const context = { params: Promise.resolve({ storyId: "story-purpose-http" }) };
const body = { purpose: { readerValue: "Useful local transit updates", focus: "Bus routes" } };
const story = {
  id: "story-purpose-http",
  title: "Transit changes",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
  purpose: body.purpose,
  purposeUpdatedAt: "updated",
  purposeUpdatedBy: { type: "operator", operatorId: "operator-9" },
};

const jsonRequest = (value: unknown) =>
  new Request("http://storyrail.test", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });

function handlerFor(
  updateStoryPurpose: (...args: never[]) => unknown,
  environment: NodeJS.ProcessEnv = { STORYRAIL_OPERATOR_ID: " operator-9 ", NODE_ENV: "test" },
) {
  const getRuntime = vi.fn(() => ({ updateStoryPurpose }) as unknown as StoryRuntime);
  return {
    getRuntime,
    handler: createUpdateStoryPurposeHttpHandler({ getRuntime, environment }),
  };
}

describe("update Story purpose HTTP handler", () => {
  it("records the configured operator and returns the updated Story", async () => {
    const updateStoryPurpose = vi.fn(async () => ({ ok: true as const, story }));
    const { handler } = handlerFor(updateStoryPurpose);

    const response = await handler(jsonRequest(body), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, story });
    expect(updateStoryPurpose).toHaveBeenCalledWith({
      storyId: "story-purpose-http",
      purpose: body.purpose,
      updatedBy: { type: "operator", operatorId: "operator-9" },
    });
  });

  it("requires JSON and rejects malformed or inexact bodies before loading runtime", async () => {
    const getRuntime = vi.fn(() => ({}) as unknown as StoryRuntime);
    const handler = createUpdateStoryPurposeHttpHandler({
      getRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-9", NODE_ENV: "test" },
    });
    const cases = [
      [
        new Request("http://storyrail.test", { method: "PATCH", body: JSON.stringify(body) }),
        415,
        "UNSUPPORTED_MEDIA_TYPE",
      ],
      [
        new Request("http://storyrail.test", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: "{",
        }),
        400,
        "INVALID_JSON",
      ],
      [jsonRequest({ purpose: body.purpose, extra: true }), 400, "INVALID_REQUEST"],
      [
        jsonRequest({ purpose: { ...body.purpose, conclusion: "Certain" } }),
        400,
        "INVALID_REQUEST",
      ],
    ] as const;

    for (const [request, status, code] of cases) {
      const response = await handler(request, context);
      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code } });
    }
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("returns service unavailable when operator provenance is not configured", async () => {
    const { handler, getRuntime } = handlerFor(vi.fn(), { NODE_ENV: "test" });

    const response = await handler(jsonRequest(body), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "OPERATOR_ID_UNAVAILABLE" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it.each([
    ["not found", "STORY_NOT_FOUND", 404],
    ["locked after assignment", "STORY_PURPOSE_LOCKED", 409],
    ["active agent run", "STORY_AGENT_RUN_ACTIVE", 409],
    ["invalid purpose", "STORY_PURPOSE_INVALID", 422],
  ] as const)("maps %s to its stable HTTP status", async (_label, code, status) => {
    const updateStoryPurpose = vi.fn(async () => ({
      ok: false as const,
      error: { code, message: "Rejected." },
    }));
    const { handler } = handlerFor(updateStoryPurpose);

    const response = await handler(jsonRequest(body), context);

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: { code } });
    expect(updateStoryPurpose).toHaveBeenCalledOnce();
  });

  it("turns unexpected runtime failures into a stable server error", async () => {
    const updateStoryPurpose = vi.fn(async () => {
      throw new Error("database detail");
    });
    const { handler } = handlerFor(updateStoryPurpose);

    const response = await handler(jsonRequest(body), context);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INTERNAL_SERVER_ERROR" },
    });
  });
});
