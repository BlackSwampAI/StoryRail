import { describe, expect, it, vi } from "vitest";

import type { ResolveLegacyDeliveryMappingResult } from "@/application/story-deliveries";
import type { StoryRuntime } from "@/runtime";

import { createResolveLegacyDeliveryMappingHttpHandler } from "./resolve-legacy-delivery-mapping-handler";

const context = { params: Promise.resolve({ storyId: "story-43" }) };
const request = (body: unknown, contentType = "application/json") =>
  new Request("http://storyrail.test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify(body),
  });

function handler(result: ResolveLegacyDeliveryMappingResult) {
  const resolveLegacyDeliveryMapping = vi.fn(async () => result);
  return {
    resolveLegacyDeliveryMapping,
    respond: createResolveLegacyDeliveryMappingHttpHandler({
      getRuntime: () => ({ resolveLegacyDeliveryMapping }) as unknown as StoryRuntime,
      environment: { STORYRAIL_OPERATOR_ID: " operator-43 " },
    }),
  };
}

describe("resolve legacy delivery mapping HTTP handler", () => {
  it("records the exact operator decision without accepting destination facts from the client", async () => {
    const resolution = {
      id: "resolution-1",
      storyId: "story-43",
      legacyDeliveryId: "delivery-legacy",
      destination: "wordpress",
      destinationInstanceId: "wordpress:https://newsroom.test",
      remoteId: "412",
      decision: "confirm",
      decidedBy: { type: "operator", operatorId: "operator-43" },
      decidedAt: "decided",
    };
    const { respond, resolveLegacyDeliveryMapping } = handler({
      ok: true,
      resolution: resolution as never,
    });

    const response = await respond(
      request({ legacyDeliveryId: "delivery-legacy", decision: "confirm" }),
      context,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, resolution });
    expect(resolveLegacyDeliveryMapping).toHaveBeenCalledWith({
      storyId: "story-43",
      legacyDeliveryId: "delivery-legacy",
      decision: "confirm",
      decidedBy: { type: "operator", operatorId: "operator-43" },
    });
  });

  it("rejects extra client-provided mapping facts", async () => {
    const { respond, resolveLegacyDeliveryMapping } = handler({
      ok: false,
      error: { code: "STORY_NOT_FOUND", message: "Missing." },
    });
    const response = await respond(
      request({ legacyDeliveryId: "delivery-legacy", decision: "dismiss", remoteId: "412" }),
      context,
    );

    expect(response.status).toBe(400);
    expect(resolveLegacyDeliveryMapping).not.toHaveBeenCalled();
  });

  it.each([
    ["LEGACY_DELIVERY_MAPPING_NOT_FOUND", 404],
    ["LEGACY_DELIVERY_MAPPING_STALE", 409],
    ["DESTINATION_NOT_CONFIGURED", 503],
    ["LEGACY_DELIVERY_MAPPING_RESOLUTION_NOT_RECORDED", 500],
  ] as const)("maps %s to %i", async (code, expected) => {
    const { respond } = handler({ ok: false, error: { code, message: "No." } } as never);

    expect(
      (
        await respond(
          request({ legacyDeliveryId: "delivery-legacy", decision: "dismiss" }),
          context,
        )
      ).status,
    ).toBe(expected);
  });

  it("requires the configured operator", async () => {
    const respond = createResolveLegacyDeliveryMappingHttpHandler({
      getRuntime: () => ({}) as StoryRuntime,
      environment: {},
    });

    expect(
      (
        await respond(
          request({ legacyDeliveryId: "delivery-legacy", decision: "confirm" }),
          context,
        )
      ).status,
    ).toBe(503);
  });

  it("requires JSON", async () => {
    const { respond } = handler({ ok: false, error: { code: "STORY_NOT_FOUND", message: "No." } });
    expect((await respond(request({}, "text/plain"), context)).status).toBe(415);
  });
});
