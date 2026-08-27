// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { operatorId, policyRunId, sourceId, storyId, type PolicyRun } from "@/domain/editorial";

import { createReadPolicyRunHttpHandler } from "./read-policy-run-handler";

const identity = policyRunId("policy-run-http");
const context = { params: Promise.resolve({ policyRunId: identity }) };
const request = () => new Request(`http://storyrail.test/api/policy-runs/${identity}`);

const run = (storyIdentity: string | null): PolicyRun =>
  ({
    id: identity,
    storyId: storyIdentity === null ? null : storyId(storyIdentity),
    sourceId: storyIdentity === null ? sourceId("source-http") : null,
    policy: "autopilot",
    requestedBy: { type: "operator", operatorId: operatorId("operator-http") },
    research: false,
    startedAt: "2026-08-26T00:00:00.000Z",
    step: storyIdentity === null ? "source_preparation" : "writer_draft",
    observedAt: "2026-08-26T00:00:10.000Z",
    status: "running",
  }) as PolicyRun;

describe("reading one policy run over HTTP", () => {
  it("answers with a run that has no Story yet, so a watcher has something to follow", async () => {
    const findById = vi.fn(async () => run(null));

    const response = await createReadPolicyRunHttpHandler({
      getRuntime: () => ({ policyRuns: { findById } }) as never,
    })(request(), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, run: run(null) });
    expect(findById).toHaveBeenCalledWith(identity);
  });

  it("names the Story the moment the run has one", async () => {
    const response = await createReadPolicyRunHttpHandler({
      getRuntime: () =>
        ({ policyRuns: { findById: vi.fn(async () => run("story-http")) } }) as never,
    })(request(), context);

    expect(await response.json()).toMatchObject({ run: { storyId: "story-http" } });
  });

  it("reports a run this installation has never recorded as missing", async () => {
    const response = await createReadPolicyRunHttpHandler({
      getRuntime: () => ({ policyRuns: { findById: vi.fn(async () => null) } }) as never,
    })(request(), context);

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "POLICY_RUN_NOT_FOUND" } });
  });

  it("answers rather than throwing when the store cannot be reached", async () => {
    const response = await createReadPolicyRunHttpHandler({
      getRuntime: () => {
        throw new Error("no pool");
      },
    })(request(), context);

    expect(response.status).toBe(500);
  });
});
