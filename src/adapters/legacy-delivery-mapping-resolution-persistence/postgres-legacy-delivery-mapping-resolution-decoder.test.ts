import { describe, expect, it } from "vitest";

import { decodePostgresLegacyDeliveryMappingResolution } from "./postgres-legacy-delivery-mapping-resolution-decoder";

const payload = {
  id: "legacy-resolution-decoder",
  storyId: "story-decoder",
  legacyDeliveryId: "delivery-decoder",
  destination: "studiocms",
  destinationInstanceId: "studiocms:https://cms.test",
  remoteId: "page-decoder",
  decision: "confirm",
  decidedBy: { type: "operator", operatorId: "operator-decoder" },
  decidedAt: "2026-09-05T10:00:00.000Z",
} as const;

describe("PostgreSQL legacy delivery mapping resolution decoder", () => {
  it("decodes the domain's exact persisted shape", () => {
    expect(decodePostgresLegacyDeliveryMappingResolution(payload)).toEqual(payload);
  });

  it.each([
    { ...payload, unexpected: true },
    { ...payload, decision: "ignore" },
    { ...payload, decidedBy: { type: "agent", operatorId: "operator-decoder" } },
  ])("fails safe on a malformed payload", (malformed) => {
    expect(() => decodePostgresLegacyDeliveryMappingResolution(malformed)).toThrow(
      expect.objectContaining({ name: "PostgresLegacyDeliveryMappingResolutionInvariantError" }),
    );
  });
});
