import { describe, expect, it, vi } from "vitest";

import type { StoryRuntime } from "@/runtime";
import { createRejectStoryHttpHandler } from "./reject-story-handler";

const context = { params: Promise.resolve({ storyId: "story-43" }) };
const request = (body: unknown) =>
  new Request("http://storyrail.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("reject Story HTTP handler", () => {
  it("accepts exactly reason, derives operator provenance, and returns the durable transition", async () => {
    const durable = {
      ok: true as const,
      story: {
        id: "story-43",
        title: "Story",
        state: "rejected",
        revisionCycle: 0,
        createdAt: "created",
        updatedAt: "rejected",
      },
      transitionReceipt: {
        transitionId: "transition-43",
        storyId: "story-43",
        previousState: "intake",
        nextState: "rejected",
        actor: { type: "operator", operatorId: "operator-43" },
        reason: "No longer in scope.",
        occurredAt: "rejected",
        revisionCycle: 0,
      },
    };
    const rejectStory = vi.fn(async () => durable as never);
    const response = await createRejectStoryHttpHandler({
      getRuntime: () => ({ rejectStory }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "  operator-43  " },
    })(request({ reason: "No longer in scope." }), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(durable);
    expect(rejectStory).toHaveBeenCalledWith({
      storyId: "story-43",
      reason: "No longer in scope.",
      rejectedBy: { type: "operator", operatorId: "operator-43" },
    });
  });

  it("returns not found without accepting browser-owned operator provenance", async () => {
    const rejectStory = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: "STORY_NOT_FOUND" as const,
        message: "The Story does not exist.",
        storyId: "story-43" as never,
      },
    }));
    const response = await createRejectStoryHttpHandler({
      getRuntime: () => ({ rejectStory }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "  operator-43  " },
    })(request({ reason: "No longer in scope." }), context);

    expect(response.status).toBe(404);
    expect(rejectStory).toHaveBeenCalledOnce();
  });

  it("rejects malformed JSON before loading the runtime", async () => {
    const getRuntime = vi.fn(() => ({}) as StoryRuntime);
    const response = await createRejectStoryHttpHandler({ getRuntime })(
      new Request("http://storyrail.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON" },
    });
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it.each([{}, { reason: "Reason", rejectedBy: "operator-43" }, { reason: 43 }])(
    "rejects an inexact body %# before loading the runtime",
    async (body) => {
      const getRuntime = vi.fn(() => ({}) as StoryRuntime);
      const response = await createRejectStoryHttpHandler({
        getRuntime,
        environment: { STORYRAIL_OPERATOR_ID: "operator-43" },
      })(request(body), context);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
      expect(getRuntime).not.toHaveBeenCalled();
    },
  );

  it("maps transition and validation failures to stable statuses", async () => {
    const rejectStory = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "INVALID_TRANSITION",
          message: "Invalid.",
          previousState: "approved",
          nextState: "rejected",
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "REASON_REQUIRED",
          message: "Required.",
          previousState: "intake",
          nextState: "rejected",
        },
      });
    const handler = createRejectStoryHttpHandler({
      getRuntime: () => ({ rejectStory }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-43" },
    });

    expect((await handler(request({ reason: "Reason" }), context)).status).toBe(409);
    expect((await handler(request({ reason: " " }), context)).status).toBe(422);
  });

  it("maps persistence conflict and unexpected failure safely", async () => {
    const rejectStory = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "STORY_REJECTION_CONFLICT",
          message: "The Story changed before rejection was recorded.",
          storyId: "story-43",
        },
      })
      .mockRejectedValueOnce(new Error("database details"));
    const handler = createRejectStoryHttpHandler({
      getRuntime: () => ({ rejectStory }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: "operator-43" },
    });

    expect((await handler(request({ reason: "Reason" }), context)).status).toBe(409);
    const unexpected = await handler(request({ reason: "Reason" }), context);
    expect(unexpected.status).toBe(500);
    await expect(unexpected.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "The Story could not be rejected.",
      },
    });
  });
});
