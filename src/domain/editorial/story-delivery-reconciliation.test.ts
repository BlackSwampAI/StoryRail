import { describe, expect, it } from "vitest";

import {
  destinationInstanceId,
  operatorId,
  recordStoryDeliveryReconciliation,
  storyDeliveryId,
  storyDeliveryReconciliationId,
  storyId,
  type StoryDeliveryReconciliation,
} from ".";

const base: StoryDeliveryReconciliation = {
  id: storyDeliveryReconciliationId("reconciliation-1"),
  storyId: storyId("story-1"),
  deliveryId: storyDeliveryId("delivery-1"),
  destination: "wordpress",
  destinationInstanceId: destinationInstanceId("wordpress:https://news.test"),
  operation: "create",
  slug: "news",
  decision: "delivered",
  remoteId: "42",
  decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
  decidedAt: "2026-09-05T12:00:00.000Z",
};

describe("recording delivery reconciliation", () => {
  it("records delivered and not-delivered decisions with their immutable snapshot", () => {
    expect(recordStoryDeliveryReconciliation(base)).toMatchObject({ ok: true });
    expect(
      recordStoryDeliveryReconciliation({ ...base, decision: "not_delivered", remoteId: null }),
    ).toMatchObject({ ok: true });
  });

  it("requires a remote id only when the operator found the page", () => {
    expect(
      recordStoryDeliveryReconciliation({
        ...base,
        remoteId: null,
      } as unknown as StoryDeliveryReconciliation),
    ).toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_DECISION_INVALID" },
    });
  });
});
