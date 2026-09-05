import { describe, expect, it, vi } from "vitest";

import type { ReconcileStoryDeliveryResult } from "@/application/story-deliveries";
import type { StoryRuntime } from "@/runtime";

import { createReconcileStoryDeliveryHttpHandler } from "./reconcile-story-delivery-handler";

const context = { params: Promise.resolve({ storyId: "story-43" }) };
const request = (body: unknown, contentType = "application/json") =>
  new Request("http://storyrail.test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });

function handler(result: ReconcileStoryDeliveryResult) {
  const reconcileStoryDelivery = vi.fn(async () => result);
  return {
    reconcileStoryDelivery,
    respond: createReconcileStoryDeliveryHttpHandler({
      getRuntime: () => ({ reconcileStoryDelivery }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: " operator-43 " },
    }),
  };
}

describe("reconcile Story delivery HTTP handler", () => {
  it("records an operator-owned delivered decision", async () => {
    const reconciliation = {
      id: "reconciliation-1",
      storyId: "story-43",
      deliveryId: "delivery-1",
      destination: "wordpress",
      destinationInstanceId: "wordpress:https://newsroom.test",
      operation: "create",
      slug: "report",
      decision: "delivered",
      remoteId: "412",
      decidedBy: { type: "operator", operatorId: "operator-43" },
      decidedAt: "opaque-decision-time",
    };
    const { respond, reconcileStoryDelivery } = handler({
      ok: true,
      reconciliation: reconciliation as never,
    });
    const response = await respond(
      request({ deliveryId: "delivery-1", decision: "delivered", remoteId: " 412 " }),
      context,
    );

    expect(response.status).toBe(201);
    expect(reconcileStoryDelivery).toHaveBeenCalledWith({
      storyId: "story-43",
      deliveryId: "delivery-1",
      decision: "delivered",
      remoteId: "412",
      decidedBy: { type: "operator", operatorId: "operator-43" },
    });
  });

  it.each([
    [{ deliveryId: "delivery-1", decision: "delivered", remoteId: null }],
    [{ deliveryId: "delivery-1", decision: "not_delivered", remoteId: "412" }],
    [{ deliveryId: "delivery-1", decision: "not_delivered", remoteId: null, destination: "wp" }],
  ])("rejects an invalid decision shape", async (body) => {
    const { respond, reconcileStoryDelivery } = handler({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_NOT_FOUND", message: "Missing." },
    });
    expect((await respond(request(body), context)).status).toBe(400);
    expect(reconcileStoryDelivery).not.toHaveBeenCalled();
  });

  it.each([
    ["STORY_NOT_FOUND", 404],
    ["STORY_DELIVERY_RECONCILIATION_NOT_FOUND", 404],
    ["STORY_DELIVERY_ALREADY_RECONCILED", 409],
    ["STORY_DELIVERY_RECONCILIATION_INVALID", 400],
    ["DESTINATION_NOT_CONFIGURED", 503],
    ["STORY_DELIVERY_RECONCILIATION_NOT_RECORDED", 500],
  ] as const)("maps %s to %i", async (code, expected) => {
    const { respond } = handler({ ok: false, error: { code, message: "No." } } as never);
    expect(
      (
        await respond(
          request({ deliveryId: "delivery-1", decision: "not_delivered", remoteId: null }),
          context,
        )
      ).status,
    ).toBe(expected);
  });

  it("requires the configured operator and JSON", async () => {
    const noOperator = createReconcileStoryDeliveryHttpHandler({
      getRuntime: () => ({}) as StoryRuntime,
      environment: {},
    });
    expect(
      (
        await noOperator(
          request({ deliveryId: "d", decision: "not_delivered", remoteId: null }),
          context,
        )
      ).status,
    ).toBe(503);
    const { respond } = handler({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_NOT_FOUND", message: "No." },
    });
    expect((await respond(request({}, "text/plain"), context)).status).toBe(415);
  });
});
