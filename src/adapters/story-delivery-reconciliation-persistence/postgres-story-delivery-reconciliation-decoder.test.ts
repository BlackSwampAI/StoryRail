import { describe, expect, it } from "vitest";

import { decodePostgresStoryDeliveryReconciliation } from "./postgres-story-delivery-reconciliation-decoder";

const payload = {
  id: "reconciliation-decoder",
  storyId: "story-decoder",
  deliveryId: "delivery-decoder",
  destination: "studiocms",
  destinationInstanceId: "studiocms:https://cms.test",
  operation: "create",
  slug: "reported-story",
  decision: "delivered",
  remoteId: "page-decoder",
  decidedBy: { type: "operator", operatorId: "operator-decoder" },
  decidedAt: "opaque:operator-clock",
} as const;

describe("PostgreSQL Story delivery reconciliation decoder", () => {
  it("decodes the domain's exact persisted shape and opaque decision time", () => {
    expect(decodePostgresStoryDeliveryReconciliation(payload)).toEqual(payload);
  });

  it.each([
    { ...payload, unexpected: true },
    { ...payload, decision: "not_delivered" },
    { ...payload, decidedBy: { type: "agent", operatorId: "operator-decoder" } },
  ])("fails safe on a malformed payload", (malformed) => {
    expect(() => decodePostgresStoryDeliveryReconciliation(malformed)).toThrow(
      expect.objectContaining({ name: "PostgresStoryDeliveryReconciliationInvariantError" }),
    );
  });
});
