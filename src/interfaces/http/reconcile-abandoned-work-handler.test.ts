import { describe, expect, it, vi } from "vitest";

import type { StoryRuntime } from "@/runtime";

import { createReconcileAbandonedWorkHttpHandler } from "./reconcile-abandoned-work-handler";

describe("reconcile abandoned work HTTP handler", () => {
  it("reports the deliveries it settled to unknown beside the other closed work", async () => {
    const reconcileAbandonedWork = vi.fn(async () => ({
      abandonedPolicyRuns: [],
      abandonedAgentRuns: [],
      abandonedToolCalls: [],
      abandonedDeliveries: [
        {
          id: "delivery-1",
          storyId: "story-1",
          revisionId: "revision-1",
          destination: "wordpress",
          destinationInstanceId: "wordpress:https://newsroom.test",
          remoteId: null,
          request: { operation: "create", slug: "report", draft: true, bodyCharacters: 64 },
          startedAt: "2026-08-23T11:00:00.000Z",
          completedAt: "2026-08-23T12:00:00.000Z",
          outcome: "unknown",
          uncertainty: { code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN", message: null },
        },
      ],
    }));
    const respond = createReconcileAbandonedWorkHttpHandler({
      getRuntime: () => ({ reconcileAbandonedWork }) as unknown as StoryRuntime,
    });

    const response = await respond();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      abandonedPolicyRuns: [],
      abandonedAgentRuns: [],
      abandonedToolCalls: [],
      abandonedDeliveries: [
        {
          id: "delivery-1",
          storyId: "story-1",
          destination: "wordpress",
          operation: "create",
          slug: "report",
        },
      ],
    });
  });
});
