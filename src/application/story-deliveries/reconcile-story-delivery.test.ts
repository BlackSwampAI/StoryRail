import { describe, expect, it } from "vitest";

import {
  articleRevisionId,
  destinationInstanceId,
  operatorId,
  storyDeliveryId,
  storyDeliveryReconciliationId,
  storyId,
  type StoryDelivery,
} from "@/domain/editorial";

import { createReconcileStoryDelivery } from "./reconcile-story-delivery";

const unknown: StoryDelivery = {
  id: storyDeliveryId("delivery-1"),
  storyId: storyId("story-1"),
  revisionId: articleRevisionId("revision-1"),
  destination: "wordpress",
  destinationInstanceId: destinationInstanceId("wordpress:https://news.test"),
  remoteId: null,
  request: { operation: "create", slug: "news", draft: true, bodyCharacters: 10 },
  startedAt: "started",
  outcome: "unknown",
  completedAt: "completed",
  uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN", message: null },
};

function harness(
  latest: StoryDelivery | null = unknown,
  exact: StoryDelivery | null = unknown,
  instance = destinationInstanceId("wordpress:https://news.test"),
) {
  const recorded: unknown[] = [];
  return {
    recorded,
    reconcile: createReconcileStoryDelivery({
      inspections: {
        inspect: async () => ({ ok: true, inspection: {} as never }),
      },
      deliveries: {
        append: async (delivery) => ({ ok: true, delivery }),
        complete: async (delivery) => ({ ok: true, delivery }),
        findLatestSucceeded: async () => null,
        findLatestLegacySucceeded: async () => null,
        findSucceededById: async () => null,
        findLatestUnresolved: async () => latest,
        findUnresolvedById: async () => exact,
        listByStoryId: async () => [unknown],
      },
      reconciliations: {
        append: async (reconciliation) => {
          recorded.push(reconciliation);
          return { ok: true, reconciliation };
        },
        findLatest: async () => null,
      },
      destinations: {
        resolve: async () => ({
          ok: true,
          destination: {
            name: "wordpress",
            instanceId: instance,
            draft: true,
            deliver: async () => {
              throw new Error("not used");
            },
          },
        }),
      },
      createReconciliationId: () => storyDeliveryReconciliationId("reconciliation-1"),
      now: () => "decided",
    }),
  };
}

describe("reconciling an unknown delivery", () => {
  it("records the exact destination snapshot under an operator decision", async () => {
    const test = harness();
    await expect(
      test.reconcile({
        storyId: unknown.storyId,
        deliveryId: unknown.id,
        decision: "delivered",
        remoteId: "42",
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: true,
      reconciliation: { operation: "create", slug: "news", remoteId: "42" },
    });
    expect(test.recorded).toHaveLength(1);
  });

  it("refuses an uncertainty that is no longer the installation's latest", async () => {
    const test = harness({ ...unknown, id: storyDeliveryId("delivery-2") });
    await expect(
      test.reconcile({
        storyId: unknown.storyId,
        deliveryId: unknown.id,
        decision: "not_delivered",
        remoteId: null,
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_NOT_FOUND" },
    });
  });

  it("does not let an update reconciliation substitute another remote identity", async () => {
    const update = {
      ...unknown,
      remoteId: "page-a",
      request: { ...unknown.request, operation: "update" as const },
    };
    const test = harness(update, update);

    await expect(
      test.reconcile({
        storyId: update.storyId,
        deliveryId: update.id,
        decision: "delivered",
        remoteId: "page-b",
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_INVALID" },
    });
    expect(test.recorded).toHaveLength(0);
  });

  it("fails closed when the current destination instance differs", async () => {
    const test = harness(unknown, unknown, destinationInstanceId("wordpress:https://other.test"));

    await expect(
      test.reconcile({
        storyId: unknown.storyId,
        deliveryId: unknown.id,
        decision: "not_delivered",
        remoteId: null,
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_RECONCILIATION_NOT_FOUND" },
    });
    expect(test.recorded).toHaveLength(0);
  });
});
