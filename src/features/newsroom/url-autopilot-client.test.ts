import { describe, expect, it, vi } from "vitest";

import { policyRunId, siteId } from "@/domain/editorial";

import {
  URL_AUTOPILOT_UNAVAILABLE_MESSAGE,
  createUrlAutopilotClient,
} from "./url-autopilot-client";

const SITE_ID = siteId("site-second");
const submittedUrl = "https://newsroom.test/apple-m5-ultra";

const response = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("starting an unattended run from the browser", () => {
  it("asks the Site it is looking at, never the installation", async () => {
    const fetchImplementation = vi.fn(async () =>
      response(202, { ok: true, policyRunId: "policy-1", sourceId: "source-1" }),
    );

    await createUrlAutopilotClient({ siteId: SITE_ID, fetch: fetchImplementation }).start({
      submittedUrl,
      research: false,
    });

    const [path, init] = fetchImplementation.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/sites/site-second/autopilot");
    expect(JSON.parse(String(init.body))).toEqual({ submittedUrl, research: false });
  });

  it("carries back the run to follow and the Source it preserved", async () => {
    const client = createUrlAutopilotClient({
      siteId: SITE_ID,
      fetch: vi.fn(async () =>
        response(202, { ok: true, policyRunId: "policy-1", sourceId: "source-1" }),
      ),
    });

    await expect(client.start({ submittedUrl, research: true })).resolves.toEqual({
      kind: "started",
      policyRunId: "policy-1",
      sourceId: "source-1",
    });
  });

  it("reports a refusal in the words the newsroom used", async () => {
    const client = createUrlAutopilotClient({
      siteId: SITE_ID,
      fetch: vi.fn(async () =>
        response(409, {
          ok: false,
          error: { code: "DUPLICATE_SOURCE", message: "This newsroom already has that page." },
        }),
      ),
    });

    await expect(client.start({ submittedUrl, research: false })).resolves.toEqual({
      kind: "refused",
      error: { code: "DUPLICATE_SOURCE", message: "This newsroom already has that page." },
    });
  });

  it("says the request could not be made rather than inventing an outcome", async () => {
    const client = createUrlAutopilotClient({
      siteId: SITE_ID,
      fetch: vi.fn(async () => {
        throw new Error("offline");
      }),
    });

    await expect(client.start({ submittedUrl, research: false })).resolves.toEqual({
      kind: "unavailable",
      message: URL_AUTOPILOT_UNAVAILABLE_MESSAGE,
    });
  });

  it("follows a run that has no Story yet", async () => {
    const run = { id: "policy-1", storyId: null, step: "source_preparation" };
    const fetchImplementation = vi.fn(async () => response(200, { ok: true, run }));

    const observed = await createUrlAutopilotClient({
      siteId: SITE_ID,
      fetch: fetchImplementation,
    }).follow(policyRunId("policy-1"));

    const [path] = fetchImplementation.mock.calls[0] as unknown as [string];
    expect(path).toBe("/api/sites/site-second/policy-runs/policy-1");
    expect(observed).toEqual({ kind: "observed", run });
  });

  it("treats a run it cannot read as nothing observed rather than as an ending", async () => {
    const client = createUrlAutopilotClient({
      siteId: SITE_ID,
      fetch: vi.fn(async () => response(404, { ok: false, error: { code: "X", message: "Y" } })),
    });

    await expect(client.follow(policyRunId("policy-1"))).resolves.toEqual({
      kind: "unavailable",
    });
  });
});
