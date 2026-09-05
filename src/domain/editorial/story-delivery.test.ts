import { describe, expect, it } from "vitest";

import {
  MAXIMUM_DELIVERY_RECORD_CHARACTERS,
  MAXIMUM_DELIVERY_SLUG_LENGTH,
  articleRevisionId,
  destinationInstanceId,
  recordStoryDelivery,
  storyDeliveryId,
  storyDeliverySlug,
  storyId,
  type StoryDelivery,
} from ".";

const base = {
  id: storyDeliveryId("delivery-1"),
  storyId: storyId("story-1"),
  revisionId: articleRevisionId("revision-1"),
  destination: "studiocms",
  destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
  remoteId: "page-1",
  request: { operation: "create", slug: "a-headline", draft: true, bodyCharacters: 120 },
  startedAt: "started",
  completedAt: "completed",
} as const;

const succeeded = (overrides: Partial<StoryDelivery> = {}): StoryDelivery =>
  ({
    ...base,
    outcome: "succeeded",
    result: { status: 200, message: "Page created" },
    ...overrides,
  }) as StoryDelivery;

describe("recording what was delivered outside the system", () => {
  it("refuses a blank destination instance identity", () => {
    expect(recordStoryDelivery(succeeded({ destinationInstanceId: "  " as never }))).toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_IDENTITY_INVALID" },
    });
  });

  it("records the intention to deliver before any response exists", () => {
    expect(recordStoryDelivery({ ...base, outcome: "running", completedAt: null })).toMatchObject({
      ok: true,
      delivery: { remoteId: "page-1", outcome: "running" },
    });
  });

  it("refuses a running delivery that claims to have finished", () => {
    expect(
      recordStoryDelivery({ ...base, outcome: "running" } as unknown as StoryDelivery),
    ).toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_IDENTITY_INVALID" },
    });
  });

  it("refuses a delivery that cannot name the page it was about to write", () => {
    expect(recordStoryDelivery(succeeded({ remoteId: "  " }))).toMatchObject({
      ok: false,
      error: { code: "STORY_DELIVERY_IDENTITY_INVALID" },
    });
  });

  it("records the address a destination used when it was not the one asked for", () => {
    expect(
      recordStoryDelivery(
        succeeded({
          result: {
            status: 201,
            message: null,
            requestedSlug: "a-headline",
            assignedSlug: "a-headline-2",
          },
        }),
      ),
    ).toMatchObject({ ok: true, delivery: { result: { assignedSlug: "a-headline-2" } } });
  });

  it("refuses a delivery that says a slug changed without saying what it changed to", () => {
    expect(
      recordStoryDelivery(
        succeeded({ result: { status: 201, message: null, requestedSlug: "a-headline" } }),
      ),
    ).toMatchObject({ ok: false, error: { code: "STORY_DELIVERY_OUTCOME_INVALID" } });
  });

  it("accepts a delivery to any named destination", () => {
    // Which destinations exist is an operator's decision, so the record describes rather than
    // constrains what may be delivered to.
    expect(recordStoryDelivery(succeeded({ destination: "somebody_elses_cms" }))).toMatchObject({
      ok: true,
    });
  });

  it("records a refused delivery as durably as an accepted one", () => {
    expect(
      recordStoryDelivery({
        ...base,
        outcome: "failed",
        failure: { code: "DESTINATION_REJECTED", message: "That slug is taken." },
      }),
    ).toMatchObject({ ok: true });
  });

  it("refuses a failure code the system does not name", () => {
    expect(
      recordStoryDelivery({
        ...base,
        outcome: "failed",
        failure: { code: "DESTINATION_HAD_A_BAD_DAY", message: null },
      } as unknown as StoryDelivery),
    ).toMatchObject({ ok: false, error: { code: "STORY_DELIVERY_OUTCOME_INVALID" } });
  });

  it("refuses a delivery that does not say whether it made or changed a page", () => {
    expect(
      recordStoryDelivery(
        succeeded({
          request: { ...base.request, operation: "replace" },
        } as unknown as StoryDelivery),
      ),
    ).toMatchObject({ ok: false, error: { code: "STORY_DELIVERY_REQUEST_INVALID" } });
  });

  it("refuses a record that carries the article instead of a summary of it", () => {
    expect(
      recordStoryDelivery(
        succeeded({
          request: { ...base.request, slug: "x".repeat(MAXIMUM_DELIVERY_RECORD_CHARACTERS + 1) },
        } as unknown as StoryDelivery),
      ),
    ).toMatchObject({ ok: false, error: { code: "STORY_DELIVERY_RECORD_TOO_LARGE" } });
  });
});

describe("deriving the address a headline is delivered to", () => {
  it("gives the same headline the same address every time", () => {
    expect(storyDeliverySlug("Council Approves the Harbour Plan")).toBe(
      "council-approves-the-harbour-plan",
    );
    expect(storyDeliverySlug("Council Approves the Harbour Plan")).toBe(
      storyDeliverySlug("Council   approves, the Harbour Plan!"),
    );
  });

  it("reduces an accented headline to the letters a reader would type", () => {
    expect(storyDeliverySlug("Café Réopens on Ménilmontant")).toBe("cafe-reopens-on-menilmontant");
  });

  it("never ends an address in a separator, however it was truncated", () => {
    const slug = storyDeliverySlug(`${"word ".repeat(60)}end`);
    expect(slug.length).toBeLessThanOrEqual(MAXIMUM_DELIVERY_SLUG_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("does not append a number to make an address unique", () => {
    // A taken slug surfaces as a recorded refusal an operator can see. Publishing to an address
    // nobody chose is worse, because it looks like it worked.
    expect(storyDeliverySlug("Same Headline")).toBe(storyDeliverySlug("Same Headline"));
  });
});
