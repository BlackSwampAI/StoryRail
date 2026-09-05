import { describe, expect, it } from "vitest";

import {
  decodePostgresStoryDelivery,
  PostgresStoryDeliveryInvariantError,
} from "./postgres-story-delivery-decoder";

const payload = {
  id: "delivery-decoder",
  storyId: "story-decoder",
  revisionId: "revision-decoder",
  destination: "studiocms",
  destinationInstanceId: "studiocms:https://cms.test",
  remoteId: "page-decoder",
  request: { operation: "create", slug: "decoder-story", draft: true, bodyCharacters: 240 },
  startedAt: "opaque-started",
  outcome: "succeeded",
  completedAt: "opaque-completed",
  result: { status: 201, message: "Created" },
} as const;

describe("PostgreSQL Story delivery decoder", () => {
  it("decodes a valid payload without changing it", () => {
    const before = structuredClone(payload);

    expect(decodePostgresStoryDelivery(payload)).toEqual(payload);
    expect(payload).toEqual(before);
  });

  it("rejects an unexpected top-level key with the persistence invariant", () => {
    expect(() => decodePostgresStoryDelivery({ ...payload, unexpected: true })).toThrow(
      PostgresStoryDeliveryInvariantError,
    );
  });

  it("accepts an explicit null identity for a legacy payload", () => {
    expect(decodePostgresStoryDelivery({ ...payload, destinationInstanceId: null })).toMatchObject({
      destinationInstanceId: null,
    });
  });

  it("rejects a payload that omits the destination identity fact", () => {
    const withoutIdentity: Record<string, unknown> = { ...payload };
    delete withoutIdentity.destinationInstanceId;

    expect(() => decodePostgresStoryDelivery(withoutIdentity)).toThrow(
      PostgresStoryDeliveryInvariantError,
    );
  });
});
