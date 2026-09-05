// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { StoryDelivery } from "@/domain/editorial";

import {
  deliveryFailureMessage,
  deliveryNotAttemptedMessage,
  readDeliveries,
} from "./delivery-outcome";

const base = {
  storyId: "story-delivery",
  revisionId: "revision-delivery",
  destination: "wordpress",
  destinationInstanceId: "wordpress:https://newsroom.test",
  request: {
    operation: "create" as const,
    slug: "a-delivered-headline",
    draft: true,
    bodyCharacters: 640,
  },
} as const;

const succeeded = (id: string, startedAt: string): StoryDelivery =>
  ({
    ...base,
    id,
    remoteId: "412",
    startedAt,
    outcome: "succeeded",
    completedAt: `${startedAt}-done`,
    result: { status: 201, message: null },
  }) as unknown as StoryDelivery;

const failed = (id: string, startedAt: string): StoryDelivery =>
  ({
    ...base,
    id,
    remoteId: null,
    startedAt,
    outcome: "failed",
    completedAt: `${startedAt}-done`,
    failure: { code: "DESTINATION_UNREACHABLE", message: null },
  }) as unknown as StoryDelivery;

describe("reading what became of a Story's deliveries", () => {
  it("says a Story with no deliveries has never been delivered", () => {
    expect(readDeliveries([])).toEqual({ standing: { kind: "never-delivered" }, delivered: null });
  });

  it("reports the last attempt as the standing one", () => {
    const first = succeeded("delivery-1", "t1");
    const second = failed("delivery-2", "t2");

    expect(readDeliveries([first, second]).standing).toEqual({
      kind: "failed",
      delivery: second,
    });
  });

  // A later Revision reaches the post the last accepted delivery made, so that record survives a
  // refusal after it: the operator has a post out there whether or not the last attempt landed.
  it("still names the post a further delivery would update after a later attempt failed", () => {
    const first = succeeded("delivery-1", "t1");

    expect(readDeliveries([first, failed("delivery-2", "t2")]).delivered).toEqual(first);
  });

  it("treats a delivery still in flight as neither delivered nor failed", () => {
    const running = {
      ...base,
      id: "delivery-running",
      remoteId: null,
      startedAt: "t1",
      outcome: "running",
      completedAt: null,
    } as unknown as StoryDelivery;

    expect(readDeliveries([running]).standing).toEqual({ kind: "in-flight", delivery: running });
  });
});

describe("explaining a delivery outcome to an operator", () => {
  it("says a refused delivery was attempted, and names the durable code", () => {
    expect(deliveryFailureMessage({ code: "DESTINATION_UNAUTHORIZED" })).toBe(
      "Delivery was attempted and refused. The destination refused the credential it was given. Check the destination credential in Settings, then deliver again. (DESTINATION_UNAUTHORIZED)",
    );
  });

  it("says plainly that a missing credential sent nothing at all", () => {
    expect(deliveryNotAttemptedMessage({ code: "CREDENTIAL_NOT_CONFIGURED" })).toBe(
      "Nothing was sent. No credential is stored for the destination. Enter one in Settings. (CREDENTIAL_NOT_CONFIGURED)",
    );
  });

  it("never reads a missing destination as a failed send", () => {
    const message = deliveryNotAttemptedMessage({ code: "DESTINATION_NOT_CONFIGURED" });

    expect(message).toContain("Nothing was sent.");
    expect(message).not.toContain("refused");
    expect(message).not.toContain("failed");
  });

  it("still names a code it has no explanation for rather than dropping it", () => {
    expect(deliveryNotAttemptedMessage({ code: "SOMETHING_NEW" })).toContain("(SOMETHING_NEW)");
  });
});
