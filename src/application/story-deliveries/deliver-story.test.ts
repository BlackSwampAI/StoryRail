import { describe, expect, it } from "vitest";

import type { StoryInspection, StoryInspectionRepository } from "@/application/story-inspection";
import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
  assignmentId,
  credentialUnavailable,
  destinationInstanceId,
  operatorId,
  storyDeliveryId,
  storyId,
  transitionId,
  type ArticleRevision,
  type CredentialSlot,
  type StoryDelivery,
  type LegacyDeliveryMappingResolution,
  type StoryDeliveryReconciliation,
} from "@/domain/editorial";

import { createDeliverStory } from "./deliver-story";
import type { DeliveryDestination, DeliveryRequest } from "./delivery-destination";
import type {
  AppendStoryDeliveryResult,
  CompleteStoryDeliveryResult,
  StoryDeliveryRepository,
} from "./story-delivery-repository";

const STORY = storyId("story-delivered");
const OPERATOR = { type: "operator", operatorId: operatorId("operator-1") } as const;

function revision(number: 1 | 2, headline: string): ArticleRevision {
  return {
    id: articleRevisionId(`revision-${number}`),
    articleId: articleId("article-1"),
    revisionNumber: number,
    writerProfileId: agentProfileId("profile-1"),
    agentRunId: agentRunId(`run-${number}`),
    headline,
    dek: `Dek ${number}`,
    blocks: [
      { kind: "heading", markdown: headline, citations: [] },
      { kind: "context", markdown: `Body of revision ${number}.`, citations: [] },
    ],
    createdBy: OPERATOR,
    createdAt: `created-${number}`,
  };
}

function inspection(overrides: Partial<StoryInspection> = {}): StoryInspection {
  return {
    story: {
      id: STORY,
      title: "A Story",
      state: "published",
      revisionCycle: 0,
      createdAt: "created",
      updatedAt: "updated",
    },
    sources: [],
    assignment: {
      assignment: {
        id: assignmentId("assignment-1"),
        storyId: STORY,
        writerProfileId: agentProfileId("profile-1"),
        sourceIds: [],
        angle: "An angle.",
        brief: "A brief.",
        constraints: null,
        assignedBy: OPERATOR,
        assignedAt: "assigned",
      },
      writerProfile: {
        id: agentProfileId("profile-1"),
        role: "writer",
        name: "A Writer",
        instructions: "Write.",
        model: null,
        builtIn: true,
      },
    },
    transitions: [
      {
        transitionId: transitionId("transition-1"),
        storyId: STORY,
        previousState: "approved",
        nextState: "published",
        actor: OPERATOR,
        reason: "Ready.",
        occurredAt: "2026-08-24T09:00:00.000Z",
        revisionCycle: 0,
      },
    ],
    agentRuns: [],
    article: {
      article: {
        id: articleId("article-1"),
        storyId: STORY,
        assignmentId: assignmentId("assignment-1"),
        createdAt: "created",
      },
      revisions: [revision(1, "Council Approves the Harbour Plan")],
    },
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    ...overrides,
  };
}

function inspections(value: StoryInspection | null): StoryInspectionRepository {
  return {
    inspect: async () =>
      value
        ? { ok: true, inspection: value }
        : {
            ok: false,
            error: {
              code: "STORY_NOT_FOUND",
              message: "The Story to inspect does not exist.",
              storyId: STORY,
            },
          },
  };
}

/** A store rather than a spy, so assertions read what was written down and not what was called. */
function deliveryStore() {
  const rows = new Map<string, StoryDelivery>();
  const repository: StoryDeliveryRepository = {
    async append(delivery): Promise<AppendStoryDeliveryResult> {
      if (rows.has(delivery.id))
        return {
          ok: false,
          error: { code: "STORY_DELIVERY_ID_CONFLICT", message: "Already recorded." },
        };
      rows.set(delivery.id, delivery);
      return { ok: true, delivery };
    },
    async complete(delivery): Promise<CompleteStoryDeliveryResult> {
      if (rows.get(delivery.id)?.outcome !== "running")
        return {
          ok: false,
          error: { code: "STORY_DELIVERY_NOT_RUNNING", message: "Not in flight." },
        };
      rows.set(delivery.id, delivery);
      return { ok: true, delivery };
    },
    async findLatestSucceeded(query) {
      return (
        [...rows.values()]
          .filter(
            (row) =>
              row.storyId === query.storyId &&
              row.destinationInstanceId === query.destinationInstanceId &&
              row.outcome === "succeeded",
          )
          .at(-1) ?? null
      );
    },
    async findLatestLegacySucceeded(query) {
      return (
        [...rows.values()]
          .filter(
            (row) =>
              row.storyId === query.storyId &&
              row.destination === query.destination &&
              row.destinationInstanceId === null &&
              row.outcome === "succeeded",
          )
          .at(-1) ?? null
      );
    },
    async findSucceededById(query) {
      const row = rows.get(query.deliveryId);
      return row?.storyId === query.storyId && row.outcome === "succeeded" ? row : null;
    },
    async findLatestUnresolved(query) {
      return (
        [...rows.values()]
          .filter(
            (row) =>
              row.storyId === query.storyId &&
              row.destinationInstanceId === query.destinationInstanceId &&
              (row.outcome === "running" || row.outcome === "unknown"),
          )
          .at(-1) ?? null
      );
    },
    async findUnresolvedById(query) {
      const row = rows.get(query.deliveryId);
      return row?.storyId === query.storyId &&
        (row.outcome === "running" || row.outcome === "unknown")
        ? row
        : null;
    },
    async listByStoryId(identity) {
      return [...rows.values()].filter((row) => row.storyId === identity);
    },
  };
  return { repository, rows };
}

function destination(
  behaviour: (request: DeliveryRequest) => ReturnType<DeliveryDestination["deliver"]>,
): DeliveryDestination {
  return {
    name: "studiocms",
    instanceId: destinationInstanceId("studiocms:https://cms.test"),
    draft: true,
    deliver: behaviour,
  };
}

function workflow(options: {
  readonly store: ReturnType<typeof deliveryStore>;
  readonly destination: DeliveryDestination;
  readonly inspection?: StoryInspection | null;
  readonly deliveryIds?: readonly string[];
  readonly resolution?: LegacyDeliveryMappingResolution | null;
  readonly reconciliation?: StoryDeliveryReconciliation | null;
}) {
  const deliveryIds = [...(options.deliveryIds ?? ["delivery-1", "delivery-2"])];
  return createDeliverStory({
    inspections: inspections(options.inspection === undefined ? inspection() : options.inspection),
    deliveries: options.store.repository,
    resolutions: {
      append: async (resolution) => ({ ok: true, resolution }),
      findLatest: async () => options.resolution ?? null,
    },
    reconciliations: {
      append: async (reconciliation) => ({ ok: true, reconciliation }),
      findLatest: async () => options.reconciliation ?? null,
    },
    destinations: { resolve: async () => ({ ok: true, destination: options.destination }) },
    createDeliveryId: () => storyDeliveryId(deliveryIds.shift() ?? "delivery-exhausted"),
    now: () => "2026-08-24T10:00:00.000Z",
  });
}

describe("delivering a published Story to a destination", () => {
  it("has already written down the delivery before the request leaves", async () => {
    const store = deliveryStore();
    let recordedWhileInFlight: StoryDelivery | undefined;
    const deliver = workflow({
      store,
      destination: destination(async () => {
        recordedWhileInFlight = store.rows.get("delivery-1");
        return {
          ok: true,
          remoteId: "page-made",
          result: { status: 200, message: "Page created" },
        };
      }),
    });

    await deliver({ storyId: STORY });

    // The destination mints the identifier, so a first delivery cannot name the page yet. What
    // it can name is the slug, which StoryRail chose and the destination honours — the one thing
    // an operator has to find a page a dead process left behind.
    expect(recordedWhileInFlight).toMatchObject({
      outcome: "running",
      completedAt: null,
      remoteId: null,
      destinationInstanceId: "studiocms:https://cms.test",
      request: { operation: "create", slug: "council-approves-the-harbour-plan" },
    });
  });

  it("learns which page it made from the answer, and records that", async () => {
    const store = deliveryStore();
    const deliver = workflow({
      store,
      destination: destination(async () => ({
        ok: true,
        remoteId: "426bfa0f-minted-by-the-destination",
        result: { status: 200, message: "Page created" },
      })),
    });

    await deliver({ storyId: STORY });

    expect(store.rows.get("delivery-1")).toMatchObject({
      outcome: "succeeded",
      remoteId: "426bfa0f-minted-by-the-destination",
    });
  });

  it("completes an accepted delivery and says when it finished", async () => {
    const store = deliveryStore();
    const deliver = workflow({
      store,
      destination: destination(async () => ({
        ok: true,
        remoteId: "page-made",
        result: { status: 200, message: "Page created" },
      })),
    });

    await expect(deliver({ storyId: STORY })).resolves.toMatchObject({
      ok: true,
      delivery: { outcome: "succeeded", completedAt: "2026-08-24T10:00:00.000Z" },
    });
    expect(store.rows.get("delivery-1")).toMatchObject({ outcome: "succeeded" });
  });

  it("records a refused delivery by name and does not try again", async () => {
    const store = deliveryStore();
    let attempts = 0;
    const deliver = workflow({
      store,
      destination: destination(async () => {
        attempts += 1;
        return {
          ok: false,
          failure: { code: "DESTINATION_REJECTED", message: "That slug is taken." },
        };
      }),
    });

    await expect(deliver({ storyId: STORY })).resolves.toMatchObject({
      ok: false,
      error: { code: "DESTINATION_REJECTED" },
    });
    expect(attempts).toBe(1);
    expect(store.rows.get("delivery-1")).toMatchObject({
      outcome: "failed",
      failure: { code: "DESTINATION_REJECTED" },
    });
  });

  it("persists an unknowable attempt and requires reconciliation before another request", async () => {
    const store = deliveryStore();
    let attempts = 0;
    const uncertain = destination(async () => {
      attempts += 1;
      return {
        ok: null,
        uncertainty: {
          code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
          message: "The connection ended before a response arrived.",
        },
      };
    });

    await expect(
      workflow({ store, destination: uncertain })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      delivery: { outcome: "unknown" },
      error: { code: "DESTINATION_RECONCILIATION_REQUIRED", deliveryId: "delivery-1" },
    });
    await expect(
      workflow({ store, destination: uncertain, deliveryIds: ["delivery-2"] })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "DESTINATION_RECONCILIATION_REQUIRED",
        deliveryId: "delivery-1",
        operation: "create",
      },
    });
    expect(attempts).toBe(1);
  });

  it("updates the page an exact delivered reconciliation identified", async () => {
    const store = deliveryStore();
    const uncertain = workflow({
      store,
      destination: destination(async () => ({
        ok: null,
        uncertainty: { code: "DESTINATION_ACCEPTED_RESPONSE_UNVERIFIABLE", message: null },
      })),
    });
    await uncertain({ storyId: STORY });
    let sent: DeliveryRequest | undefined;
    await workflow({
      store,
      deliveryIds: ["delivery-2"],
      destination: destination(async (request) => {
        sent = request;
        return { ok: true, remoteId: "page-found", result: { status: 200, message: "Saved" } };
      }),
      reconciliation: {
        id: "reconciliation-1" as never,
        storyId: STORY,
        deliveryId: storyDeliveryId("delivery-1"),
        destination: "studiocms",
        destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
        operation: "create",
        slug: "council-approves-the-harbour-plan",
        decision: "delivered",
        remoteId: "page-found",
        decidedBy: OPERATOR,
        decidedAt: "decided",
      },
    })({ storyId: STORY });

    expect(sent).toMatchObject({ operation: "update", remoteId: "page-found" });
  });

  it("retains a verified mapping after an uncertain update was not delivered", async () => {
    const store = deliveryStore();
    const uncertain = destination(async () => ({
      ok: null,
      uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN", message: null },
    }));
    await workflow({ store, destination: uncertain })({ storyId: STORY });

    const deliveredCreate: StoryDeliveryReconciliation = {
      id: "reconciliation-create" as never,
      storyId: STORY,
      deliveryId: storyDeliveryId("delivery-1"),
      destination: "studiocms",
      destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
      operation: "create",
      slug: "council-approves-the-harbour-plan",
      decision: "delivered",
      remoteId: "page-a",
      decidedBy: OPERATOR,
      decidedAt: "decided-create",
    };
    await workflow({
      store,
      destination: uncertain,
      deliveryIds: ["delivery-2"],
      reconciliation: deliveredCreate,
    })({ storyId: STORY });
    expect(store.rows.get("delivery-2")).toMatchObject({
      outcome: "unknown",
      remoteId: "page-a",
      request: { operation: "update" },
    });

    let nextRequest: DeliveryRequest | undefined;
    const notDeliveredUpdate: StoryDeliveryReconciliation = {
      ...deliveredCreate,
      id: "reconciliation-update" as never,
      deliveryId: storyDeliveryId("delivery-2"),
      operation: "update",
      decision: "not_delivered",
      remoteId: null,
      decidedAt: "decided-update",
    };
    await workflow({
      store,
      deliveryIds: ["delivery-3"],
      reconciliation: notDeliveredUpdate,
      destination: destination(async (request) => {
        nextRequest = request;
        return { ok: true, remoteId: "page-a", result: { status: 200, message: "Saved" } };
      }),
    })({ storyId: STORY });

    expect(nextRequest).toMatchObject({ operation: "update", remoteId: "page-a" });
  });

  it("permits a fresh create after an uncertain create was not delivered", async () => {
    const store = deliveryStore();
    await workflow({
      store,
      destination: destination(async () => ({
        ok: null,
        uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN", message: null },
      })),
    })({ storyId: STORY });
    let nextRequest: DeliveryRequest | undefined;
    await workflow({
      store,
      deliveryIds: ["delivery-2"],
      reconciliation: {
        id: "reconciliation-1" as never,
        storyId: STORY,
        deliveryId: storyDeliveryId("delivery-1"),
        destination: "studiocms",
        destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
        operation: "create",
        slug: "council-approves-the-harbour-plan",
        decision: "not_delivered",
        remoteId: null,
        decidedBy: OPERATOR,
        decidedAt: "decided",
      },
      destination: destination(async (request) => {
        nextRequest = request;
        return { ok: true, remoteId: "page-new", result: { status: 200, message: "Saved" } };
      }),
    })({ storyId: STORY });

    expect(nextRequest).toMatchObject({ operation: "create", remoteId: null });
  });

  it("blocks a stranded running intent before calling the destination", async () => {
    const store = deliveryStore();
    store.rows.set("delivery-running", {
      id: storyDeliveryId("delivery-running"),
      storyId: STORY,
      revisionId: articleRevisionId("revision-1"),
      destination: "studiocms",
      destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
      remoteId: null,
      request: {
        operation: "create",
        slug: "council-approves-the-harbour-plan",
        draft: true,
        bodyCharacters: 42,
      },
      startedAt: "started",
      outcome: "running",
      completedAt: null,
    });
    let attempted = false;

    await expect(
      workflow({
        store,
        destination: destination(async () => {
          attempted = true;
          throw new Error("must not deliver");
        }),
      })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "DESTINATION_RECONCILIATION_REQUIRED",
        deliveryId: "delivery-running",
      },
    });
    expect(attempted).toBe(false);
    expect(store.rows.size).toBe(1);
  });

  it("does not apply a reconciliation from another destination instance", async () => {
    const store = deliveryStore();
    await workflow({
      store,
      destination: destination(async () => ({
        ok: null,
        uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN", message: null },
      })),
    })({ storyId: STORY });
    let attempted = false;

    await expect(
      workflow({
        store,
        reconciliation: {
          id: "reconciliation-other" as never,
          storyId: STORY,
          deliveryId: storyDeliveryId("delivery-1"),
          destination: "studiocms",
          destinationInstanceId: destinationInstanceId("studiocms:https://other.test"),
          operation: "create",
          slug: "council-approves-the-harbour-plan",
          decision: "delivered",
          remoteId: "other-page",
          decidedBy: OPERATOR,
          decidedAt: "decided",
        },
        destination: destination(async () => {
          attempted = true;
          throw new Error("must not deliver");
        }),
      })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DESTINATION_RECONCILIATION_REQUIRED" },
    });
    expect(attempted).toBe(false);
  });

  it("writes nothing down when the credential cannot be read", async () => {
    const store = deliveryStore();
    let reached = false;
    const deliver = createDeliverStory({
      inspections: inspections(inspection()),
      deliveries: store.repository,
      resolutions: {
        append: async (resolution) => ({ ok: true, resolution }),
        findLatest: async () => null,
      },
      reconciliations: {
        append: async (reconciliation) => ({ ok: true, reconciliation }),
        findLatest: async () => null,
      },
      destinations: {
        resolve: async () => ({
          ok: false,
          error: credentialUnavailable(
            "studiocms_api_token" as CredentialSlot,
            "CREDENTIAL_UNREADABLE",
            "The stored studiocms_api_token could not be read.",
          ),
        }),
      },
      createDeliveryId: () => {
        reached = true;
        return storyDeliveryId("delivery-never");
      },
      now: () => "2026-08-24T10:00:00.000Z",
    });

    await expect(deliver({ storyId: STORY })).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE", slot: "studiocms_api_token" },
    });
    // A running row for an attempt that never had a chance to run would be a lie in the record.
    expect(store.rows.size).toBe(0);
    expect(reached).toBe(false);
  });

  it("updates the page it already made when a later Revision is delivered", async () => {
    const store = deliveryStore();
    const requests: DeliveryRequest[] = [];
    const accept = destination(async (request) => {
      requests.push(request);
      return { ok: true, remoteId: "page-made", result: { status: 200, message: "Saved" } };
    });

    await workflow({ store, destination: accept })({ storyId: STORY });

    const revised = inspection({
      article: {
        article: {
          id: articleId("article-1"),
          storyId: STORY,
          assignmentId: assignmentId("assignment-1"),
          createdAt: "created",
        },
        revisions: [
          revision(1, "Council Approves the Harbour Plan"),
          revision(2, "Council Approves the Harbour Plan"),
        ],
      },
    });
    await workflow({
      store,
      destination: accept,
      inspection: revised,
      deliveryIds: ["delivery-2"],
    })({ storyId: STORY });

    expect(requests.map((request) => request.operation)).toEqual(["create", "update"]);
    // The first knows no identifier; the second knows the one the destination gave back, because
    // the delivery record is the authority on what StoryRail put there.
    expect(requests.map((request) => request.remoteId)).toEqual([null, "page-made"]);
    expect(store.rows.get("delivery-2")).toMatchObject({
      revisionId: "revision-2",
      remoteId: "page-made",
    });
  });

  it("creates a separate page when the configured installation changes", async () => {
    const store = deliveryStore();
    const requests: DeliveryRequest[] = [];
    await workflow({
      store,
      destination: destination(async (request) => {
        requests.push(request);
        return { ok: true, remoteId: "old-page", result: { status: 200, message: "Saved" } };
      }),
    })({ storyId: STORY });

    const replacement = {
      ...destination(async (request) => {
        requests.push(request);
        return { ok: true, remoteId: "new-page", result: { status: 200, message: "Saved" } };
      }),
      instanceId: destinationInstanceId("studiocms:https://replacement.test"),
    };
    await workflow({ store, destination: replacement, deliveryIds: ["delivery-2"] })({
      storyId: STORY,
    });

    expect(requests.map(({ operation, remoteId }) => ({ operation, remoteId }))).toEqual([
      { operation: "create", remoteId: null },
      { operation: "create", remoteId: null },
    ]);
  });

  it("blocks an unbound legacy mapping when no mapping exists for the current installation", async () => {
    const store = deliveryStore();
    store.rows.set("legacy", {
      id: storyDeliveryId("legacy"),
      storyId: STORY,
      revisionId: articleRevisionId("revision-1"),
      destination: "studiocms",
      destinationInstanceId: null,
      remoteId: "legacy-page",
      request: { operation: "create", slug: "old", draft: true, bodyCharacters: 1 },
      startedAt: "started",
      outcome: "succeeded",
      completedAt: "completed",
      result: { status: 200, message: "Saved" },
    });
    let attempted = false;

    await expect(
      workflow({
        store,
        destination: destination(async () => {
          attempted = true;
          throw new Error("must not deliver");
        }),
      })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: "DESTINATION_MAPPING_REQUIRES_REVIEW",
        legacyDeliveryId: "legacy",
        destination: "studiocms",
        destinationInstanceId: "studiocms:https://cms.test",
        remoteId: "legacy-page",
      },
    });
    expect(attempted).toBe(false);
    expect(store.rows.size).toBe(1);
    expect(store.rows.has("delivery-1")).toBe(false);
  });

  it("uses a confirmed current mapping even when an older legacy mapping remains", async () => {
    const store = deliveryStore();
    const accept = destination(async () => ({
      ok: true,
      remoteId: "current-page",
      result: { status: 200, message: "Saved" },
    }));
    await workflow({ store, destination: accept })({ storyId: STORY });
    const current = store.rows.get("delivery-1")!;
    store.rows.set("legacy", {
      ...current,
      id: storyDeliveryId("legacy"),
      destinationInstanceId: null,
      remoteId: "legacy-page",
    });
    let request: DeliveryRequest | undefined;

    await workflow({
      store,
      destination: destination(async (sent) => {
        request = sent;
        return { ok: true, remoteId: sent.remoteId!, result: { status: 200, message: "Saved" } };
      }),
      deliveryIds: ["delivery-2"],
    })({ storyId: STORY });

    expect(request).toMatchObject({ operation: "update", remoteId: "current-page" });
  });

  it.each([
    ["confirm", "update", "legacy-page"],
    ["dismiss", "create", null],
  ] as const)(
    "uses a %s resolution to choose the next operation",
    async (decision, operation, remoteId) => {
      const store = deliveryStore();
      store.rows.set("legacy", {
        id: storyDeliveryId("legacy"),
        storyId: STORY,
        revisionId: articleRevisionId("revision-1"),
        destination: "studiocms",
        destinationInstanceId: null,
        remoteId: "legacy-page",
        request: { operation: "create", slug: "old", draft: true, bodyCharacters: 1 },
        startedAt: "started",
        outcome: "succeeded",
        completedAt: "completed",
        result: { status: 200, message: "Saved" },
      });
      let request: DeliveryRequest | undefined;
      await workflow({
        store,
        destination: destination(async (sent) => {
          request = sent;
          return {
            ok: true,
            remoteId: sent.remoteId ?? "new-page",
            result: { status: 200, message: "Saved" },
          };
        }),
        resolution: {
          id: "resolution-1" as never,
          storyId: STORY,
          legacyDeliveryId: storyDeliveryId("legacy"),
          destination: "studiocms",
          destinationInstanceId: destinationInstanceId("studiocms:https://cms.test"),
          remoteId: "legacy-page",
          decision,
          decidedBy: { type: "operator", operatorId: "operator-1" as never },
          decidedAt: "decided",
        },
      })({ storyId: STORY });
      expect(request).toMatchObject({ operation, remoteId });
    },
  );

  it("does not apply a resolution recorded for another destination instance", async () => {
    const store = deliveryStore();
    store.rows.set("legacy", {
      id: storyDeliveryId("legacy"),
      storyId: STORY,
      revisionId: articleRevisionId("revision-1"),
      destination: "studiocms",
      destinationInstanceId: null,
      remoteId: "legacy-page",
      request: { operation: "create", slug: "old", draft: true, bodyCharacters: 1 },
      startedAt: "started",
      outcome: "succeeded",
      completedAt: "completed",
      result: { status: 200, message: "Saved" },
    });
    let attempted = false;

    await expect(
      workflow({
        store,
        destination: destination(async () => {
          attempted = true;
          throw new Error("must not deliver");
        }),
        resolution: {
          id: "resolution-other-instance" as never,
          storyId: STORY,
          legacyDeliveryId: storyDeliveryId("legacy"),
          destination: "studiocms",
          destinationInstanceId: destinationInstanceId("studiocms:https://other.test"),
          remoteId: "legacy-page",
          decision: "confirm",
          decidedBy: { type: "operator", operatorId: "operator-1" as never },
          decidedAt: "decided",
        },
      })({ storyId: STORY }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "DESTINATION_MAPPING_REQUIRES_REVIEW" },
    });
    expect(attempted).toBe(false);
  });

  it("records how large the body was rather than a second copy of it", async () => {
    const store = deliveryStore();
    let sent: DeliveryRequest | undefined;
    await workflow({
      store,
      destination: destination(async (request) => {
        sent = request;
        return { ok: true, remoteId: "page-made", result: { status: 200, message: "Saved" } };
      }),
    })({ storyId: STORY });

    const recorded = store.rows.get("delivery-1");
    expect(recorded?.request.bodyCharacters).toBe(sent?.bodyMarkdown.length);
    expect(JSON.stringify(recorded)).not.toContain("Body of revision 1.");
  });

  it("refuses to deliver a Story the newsroom has not published", async () => {
    const store = deliveryStore();
    const unpublished = inspection();
    await expect(
      workflow({
        store,
        destination: destination(async () => {
          throw new Error("nothing should reach the destination");
        }),
        inspection: { ...unpublished, story: { ...unpublished.story, state: "approved" } },
      })({ storyId: STORY }),
    ).resolves.toMatchObject({ ok: false, error: { code: "STORY_NOT_PUBLISHED" } });
    expect(store.rows.size).toBe(0);
  });

  it("answers with the destination the newsroom has not configured", async () => {
    const store = deliveryStore();
    const deliver = createDeliverStory({
      inspections: inspections(inspection()),
      deliveries: store.repository,
      resolutions: {
        append: async (resolution) => ({ ok: true, resolution }),
        findLatest: async () => null,
      },
      reconciliations: {
        append: async (reconciliation) => ({ ok: true, reconciliation }),
        findLatest: async () => null,
      },
      destinations: {
        resolve: async () => ({
          ok: false,
          error: {
            code: "DESTINATION_NOT_CONFIGURED",
            message: "This newsroom has no destination to deliver to.",
          },
        }),
      },
      createDeliveryId: () => storyDeliveryId("delivery-never"),
      now: () => "2026-08-24T10:00:00.000Z",
    });

    await expect(deliver({ storyId: STORY })).resolves.toMatchObject({
      ok: false,
      error: { code: "DESTINATION_NOT_CONFIGURED" },
    });
    expect(store.rows.size).toBe(0);
  });

  it("delivers the latest Revision, at the address its headline derives", async () => {
    const store = deliveryStore();
    let sent: DeliveryRequest | undefined;
    await workflow({
      store,
      destination: destination(async (request) => {
        sent = request;
        return { ok: true, remoteId: "page-made", result: { status: 200, message: "Saved" } };
      }),
    })({ storyId: STORY });

    expect(sent).toMatchObject({
      revisionId: "revision-1",
      slug: "council-approves-the-harbour-plan",
      headline: "Council Approves the Harbour Plan",
    });
  });
});
