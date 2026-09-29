// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";

import {
  createInterruptedWorkClient,
  INTERRUPTED_WORK_UNAVAILABLE_MESSAGE,
} from "./interrupted-work-client";

const SITE_ID = siteId("site-second");

const DELIVERY = {
  id: "delivery-1",
  storyId: "story-1",
  destination: "wordpress",
  operation: "create",
  slug: "a-stuck-delivery",
};

const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("interrupted-work-client", () => {
  it("asks the Site it was built for to close out its interrupted work", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(200, {
        ok: true,
        abandonedPolicyRuns: [{ id: "policy-1" }],
        abandonedAgentRuns: [{ id: "run-1" }, { id: "run-2" }],
        abandonedToolCalls: [],
        abandonedDeliveries: [DELIVERY],
      }),
    );

    const result = await createInterruptedWorkClient({ siteId: SITE_ID, fetch }).recover();

    expect(result).toEqual({
      kind: "completed",
      recovery: { policyRuns: 1, agentRuns: 2, toolCalls: 0, deliveries: [DELIVERY] },
    });
    expect(fetch).toHaveBeenCalledWith("/api/sites/site-second/reconciliation", {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  });

  it("is unavailable rather than guessing when the answer is not the expected shape", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response(200, { ok: true, abandonedPolicyRuns: [], abandonedAgentRuns: [] }),
      );

    await expect(
      createInterruptedWorkClient({ siteId: SITE_ID, fetch }).recover(),
    ).resolves.toEqual({ kind: "unavailable", message: INTERRUPTED_WORK_UNAVAILABLE_MESSAGE });
  });

  it("is unavailable on a server failure or a network error", async () => {
    const failing = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(500, { ok: false, error: { code: "INTERNAL_SERVER_ERROR" } }));
    const offline = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));

    for (const fetch of [failing, offline])
      await expect(
        createInterruptedWorkClient({ siteId: SITE_ID, fetch }).recover(),
      ).resolves.toMatchObject({ kind: "unavailable" });
  });
});
