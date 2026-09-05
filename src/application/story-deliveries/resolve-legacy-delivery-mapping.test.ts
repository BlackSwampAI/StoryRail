import { describe, expect, it } from "vitest";

import {
  articleRevisionId,
  destinationInstanceId,
  legacyDeliveryMappingResolutionId,
  operatorId,
  storyDeliveryId,
  storyId,
  type StoryDelivery,
} from "@/domain/editorial";

import { createResolveLegacyDeliveryMapping } from "./resolve-legacy-delivery-mapping";

const STORY = storyId("story-1");
const LEGACY = storyDeliveryId("delivery-legacy");
const legacy: StoryDelivery = {
  id: LEGACY,
  storyId: STORY,
  revisionId: articleRevisionId("revision-1"),
  destination: "studiocms",
  destinationInstanceId: null,
  remoteId: "page-1",
  request: { operation: "create", slug: "story", draft: true, bodyCharacters: 4 },
  startedAt: "2026-09-01T12:00:00.000Z",
  outcome: "succeeded",
  completedAt: "2026-09-01T12:00:01.000Z",
  result: { status: 201, message: "Created" },
};

function workflow(options: { exact?: StoryDelivery | null; latest?: StoryDelivery | null } = {}) {
  const written: unknown[] = [];
  const resolve = createResolveLegacyDeliveryMapping({
    inspections: { inspect: async () => ({ ok: true, inspection: {} as never }) },
    deliveries: {
      append: async (delivery) => ({ ok: true, delivery }),
      complete: async (delivery) => ({ ok: true, delivery }),
      findLatestSucceeded: async () => null,
      findLatestUnresolved: async () => null,
      findUnresolvedById: async () => null,
      findLatestLegacySucceeded: async () =>
        options.latest === undefined ? legacy : options.latest,
      findSucceededById: async () => (options.exact === undefined ? legacy : options.exact),
      listByStoryId: async () => [],
    },
    resolutions: {
      append: async (resolution) => {
        written.push(resolution);
        return { ok: true, resolution };
      },
      findLatest: async () => null,
    },
    destinations: {
      resolve: async () => ({
        ok: true,
        destination: {
          name: "studiocms",
          instanceId: destinationInstanceId("studiocms:https://cms.test"),
          draft: true,
          deliver: async () => {
            throw new Error("unused");
          },
        },
      }),
    },
    createResolutionId: () => legacyDeliveryMappingResolutionId("resolution-1"),
    now: () => "2026-09-05T12:00:00.000Z",
  });
  return { resolve, written };
}

describe("resolving a legacy delivery mapping", () => {
  it("snapshots the exact legacy mapping and current destination instance", async () => {
    const { resolve, written } = workflow();
    await expect(
      resolve({
        storyId: STORY,
        legacyDeliveryId: LEGACY,
        decision: "confirm",
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({ ok: true, resolution: { remoteId: "page-1" } });
    expect(written).toHaveLength(1);
  });

  it("refuses an absent or stale legacy delivery", async () => {
    await expect(
      workflow({ exact: null }).resolve({
        storyId: STORY,
        legacyDeliveryId: LEGACY,
        decision: "dismiss",
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "LEGACY_DELIVERY_MAPPING_NOT_FOUND" },
    });
    await expect(
      workflow({ latest: { ...legacy, id: storyDeliveryId("newer") } }).resolve({
        storyId: STORY,
        legacyDeliveryId: LEGACY,
        decision: "dismiss",
        decidedBy: { type: "operator", operatorId: operatorId("operator-1") },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "LEGACY_DELIVERY_MAPPING_STALE" },
    });
  });
});
