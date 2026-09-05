import { describe, expect, it, vi } from "vitest";

import type { DeliverStoryResult } from "@/application/story-deliveries";
import { destinationInstanceId, storyDeliveryId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import { createDeliverStoryHttpHandler } from "./deliver-story-handler";

const context = { params: Promise.resolve({ storyId: "story-43" }) };
const request = (body: unknown) =>
  new Request("http://storyrail.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const DELIVERY = {
  id: "delivery-1",
  storyId: "story-43",
  revisionId: "revision-1",
  destination: "studiocms",
  destinationInstanceId: "studiocms:https://cms.example.test",
  remoteId: "426bfa0f-1c3d-4f1e-9a5b-7c2d0e8f1234",
  request: { operation: "create", slug: "a-headline", draft: true, bodyCharacters: 42 },
  startedAt: "started",
  completedAt: "completed",
  outcome: "succeeded",
  result: { status: 200, message: "Page created" },
};

function handler(result: DeliverStoryResult) {
  const deliverStory = vi.fn(async () => result);
  return {
    deliverStory,
    respond: createDeliverStoryHttpHandler({
      getRuntime: () => ({ deliverStory }) as unknown as StoryRuntime,
    }),
  };
}

describe("deliver Story HTTP handler", () => {
  it("delivers the Story named in the path and answers with the durable record", async () => {
    const { deliverStory, respond } = handler({
      ok: true,
      delivery: DELIVERY as never,
    });

    const response = await respond(request({}), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, delivery: DELIVERY });
    expect(deliverStory).toHaveBeenCalledWith({ storyId: "story-43" });
  });

  it("refuses a body offering choices the caller does not get to make", async () => {
    const { deliverStory, respond } = handler({ ok: true, delivery: DELIVERY as never });

    const response = await respond(request({ destination: "somewhere-else" }), context);

    expect(response.status).toBe(400);
    expect(deliverStory).not.toHaveBeenCalled();
  });

  it("answers a missing credential as work the newsroom cannot yet attempt", async () => {
    const { respond } = handler({
      ok: false,
      error: {
        code: "CREDENTIAL_NOT_CONFIGURED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: "studiocms_api_token" as never,
        message: "No studiocms_api_token has been configured for this newsroom.",
      },
    });

    const response = await respond(request({}), context);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { slot: "studiocms_api_token" },
    });
  });

  it("answers a refused delivery with the record of it, not as a bad request", async () => {
    const { respond } = handler({
      ok: false,
      delivery: { ...DELIVERY, outcome: "failed" } as never,
      error: { code: "DESTINATION_REJECTED", message: "That slug is taken." },
    });

    const response = await respond(request({}), context);

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      delivery: { outcome: "failed" },
    });
  });

  it("refuses to deliver a Story the newsroom has not published", async () => {
    const { respond } = handler({
      ok: false,
      error: {
        code: "STORY_NOT_PUBLISHED",
        message: "Only a published Story is delivered to a destination.",
      },
    });

    expect((await respond(request({}), context)).status).toBe(409);
  });

  it("answers a legacy destination mapping that requires review as a conflict", async () => {
    const { respond } = handler({
      ok: false,
      error: {
        code: "DESTINATION_MAPPING_REQUIRES_REVIEW",
        message: "Confirm or dismiss the legacy destination mapping before delivering.",
        legacyDeliveryId: storyDeliveryId("delivery-legacy"),
        destination: "wordpress",
        destinationInstanceId: destinationInstanceId("wordpress:https://newsroom.test"),
        remoteId: "412",
      },
    });

    expect((await respond(request({}), context)).status).toBe(409);
  });

  it("answers an uncertain delivery that requires reconciliation as a conflict", async () => {
    const { respond } = handler({
      ok: false,
      error: {
        code: "DESTINATION_RECONCILIATION_REQUIRED",
        message: "Check the destination before delivering again.",
        deliveryId: storyDeliveryId("delivery-unknown"),
        destination: "wordpress",
        destinationInstanceId: destinationInstanceId("wordpress:https://newsroom.test"),
        operation: "create",
        slug: "uncertain-report",
        remoteId: null,
      },
    });

    expect((await respond(request({}), context)).status).toBe(409);
  });

  it("answers a Story that does not exist as a Story that does not exist", async () => {
    const { respond } = handler({
      ok: false,
      error: { code: "STORY_NOT_FOUND", message: "The Story does not exist." },
    });

    expect((await respond(request({}), context)).status).toBe(404);
  });

  it("refuses a request that is not JSON", async () => {
    const { respond } = handler({ ok: true, delivery: DELIVERY as never });
    const response = await respond(
      new Request("http://storyrail.test", { method: "POST", body: "{}" }),
      context,
    );

    expect(response.status).toBe(415);
  });
});
