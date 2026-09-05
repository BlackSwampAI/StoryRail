import { describe, expect, it } from "vitest";

import {
  destinationInstanceId,
  legacyDeliveryMappingResolutionId,
  operatorId,
  recordLegacyDeliveryMappingResolution,
  storyDeliveryId,
  storyId,
  type LegacyDeliveryMappingResolution,
} from ".";

const resolution = (overrides: Partial<LegacyDeliveryMappingResolution> = {}) => ({
  id: legacyDeliveryMappingResolutionId("resolution-1"),
  storyId: storyId("story-1"),
  legacyDeliveryId: storyDeliveryId("delivery-legacy"),
  destination: "studiocms",
  destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
  remoteId: "page-1",
  decision: "confirm" as const,
  decidedBy: { type: "operator" as const, operatorId: operatorId("operator-1") },
  decidedAt: "2026-09-05T12:00:00.000Z",
  ...overrides,
});

describe("legacy delivery mapping resolution", () => {
  it("records the complete immutable destination snapshot", () => {
    expect(recordLegacyDeliveryMappingResolution(resolution())).toEqual({
      ok: true,
      resolution: resolution(),
    });
  });

  it("rejects blank snapshot identities and a non-operator actor", () => {
    expect(recordLegacyDeliveryMappingResolution(resolution({ remoteId: " " }))).toMatchObject({
      ok: false,
      error: { code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_IDENTITY_INVALID" },
    });
    expect(
      recordLegacyDeliveryMappingResolution(resolution({ decidedBy: { type: "agent" } as never })),
    ).toMatchObject({
      ok: false,
      error: { code: "LEGACY_DELIVERY_MAPPING_RESOLUTION_OPERATOR_REQUIRED" },
    });
  });
});
