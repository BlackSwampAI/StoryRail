// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { operatorId, sourceId } from "@/domain/editorial";

import type { AutopilotRuntimes } from "./autopilot-sequence";
import { createRunUrlAutopilotHttpHandler } from "./run-url-autopilot-handler";

const submittedUrl = "https://newsroom.test/apple-m5-ultra";
const requestedBy = { type: "operator" as const, operatorId: operatorId("operator-autopilot") };
const environment = {
  NODE_ENV: "test",
  STORYRAIL_OPERATOR_ID: "operator-autopilot",
} as NodeJS.ProcessEnv;

const request = (body: string, contentType = "application/json") =>
  new Request("http://storyrail.test/api/sites/site-default/autopilot", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });

const source = {
  id: sourceId("source-http-autopilot"),
  type: "url" as const,
  submittedUrl,
  canonicalUrl: submittedUrl,
  submittedBy: requestedBy,
  receivedAt: "2026-08-26T00:00:00.000Z",
};

function harness(
  preserveAndExtractUrlSource: ReturnType<typeof vi.fn>,
  extras: Partial<Record<string, unknown>> = {},
) {
  return {
    story: {},
    assignmentEditor: { generateAssignmentProposal: vi.fn() },
    writer: {},
    director: {},
    sourceEvidence: { preserveAndExtractUrlSource },
    evidencePreparation: { prepareSourceEvidence: vi.fn() },
    ...extras,
  } as unknown as AutopilotRuntimes;
}

describe("starting autopilot from a URL over HTTP", () => {
  it("answers as soon as the page is preserved, leaving the rest to run unattended", async () => {
    // The sequence itself is exercised in autopilot-sequence.test.ts. What matters here is that
    // the operator is answered while it is still outstanding.
    let settle: () => void = () => {};
    const completion = new Promise<unknown>((resolve) => {
      settle = () => resolve({ ok: true });
    });
    const preserve = vi.fn(async () => ({
      ok: true,
      source,
      extraction: {
        id: "extraction-http-autopilot",
        outcome: "succeeded",
        document: { title: "Apple announces the M5 Ultra" },
      },
    }));
    const runtimes = harness(preserve);
    // The sequence continues after the response, so preparation is held open until this test
    // releases it. That is what makes the assertion below about the response meaningful.
    (runtimes.evidencePreparation as { prepareSourceEvidence: unknown }).prepareSourceEvidence =
      vi.fn(async () => {
        await completion;
        return { ok: false, error: { code: "SOURCE_NOT_FOUND", message: "Gone." } };
      });
    const scheduled: (() => Promise<void>)[] = [];

    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => runtimes,
      environment,
      after: (task) => scheduled.push(task),
    })(request(JSON.stringify({ submittedUrl })));

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, policyRunId: null, sourceId: source.id });
    expect(preserve).toHaveBeenCalledWith({ submittedUrl, submittedBy: requestedBy });
    expect(scheduled).toHaveLength(1);
    settle();
    await Promise.all(scheduled.map((task) => task()));
  });

  it("records the operator who authorised the run as the actor on the Source", async () => {
    const preserve = vi.fn(async () => ({
      ok: false,
      stage: "preservation",
      error: { code: "INVALID_SOURCE_URL", message: "That is not a URL." },
    }));

    await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(preserve),
      environment,
      after: () => {},
    })(request(JSON.stringify({ submittedUrl: "nonsense" })));

    expect(preserve).toHaveBeenCalledWith({ submittedUrl: "nonsense", submittedBy: requestedBy });
  });

  it("hands back a URL it cannot use rather than opening a Story for it", async () => {
    const preserve = vi.fn(async () => ({
      ok: false,
      stage: "preservation",
      error: { code: "INVALID_SOURCE_URL", message: "That is not a URL." },
    }));

    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(preserve),
      environment,
      after: () => {},
    })(request(JSON.stringify({ submittedUrl: "nonsense" })));

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "INVALID_SOURCE_URL", message: "That is not a URL." },
    });
  });

  it("reports a page this newsroom already has as a conflict, not a fault", async () => {
    const preserve = vi.fn(async () => ({
      ok: false,
      stage: "preservation",
      error: { code: "DUPLICATE_SOURCE", message: "Already ingested." },
    }));

    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(preserve),
      environment,
      after: () => {},
    })(request(JSON.stringify({ submittedUrl })));

    expect(response.status).toBe(409);
  });

  it("says the extractor has no key rather than blaming the newsroom", async () => {
    const preserve = vi.fn(async () => ({
      ok: false,
      stage: "extraction",
      source,
      error: {
        code: "CREDENTIAL_NOT_CONFIGURED",
        message: "No Firecrawl key is configured.",
        slot: "firecrawl_api_key",
        reason: "CREDENTIAL_NOT_CONFIGURED",
      },
    }));

    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(preserve),
      environment,
      after: () => {},
    })(request(JSON.stringify({ submittedUrl })));

    expect(response.status).toBe(503);
  });

  it.each([
    ["{", "INVALID_JSON", 400],
    ['{"submittedUrl":7}', "INVALID_REQUEST", 400],
    ['{"submittedUrl":"https://a.test","tone":"breezy"}', "INVALID_REQUEST", 400],
    ['{"submittedUrl":"https://a.test","research":"yes"}', "INVALID_REQUEST", 400],
  ])("refuses %s before anything is preserved", async (body, code, status) => {
    const preserve = vi.fn();
    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(preserve),
      environment,
      after: () => {},
    })(request(body));

    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(preserve).not.toHaveBeenCalled();
  });

  it("refuses a request that is not JSON", async () => {
    const response = await createRunUrlAutopilotHttpHandler({
      getRuntimes: () => harness(vi.fn()),
      environment,
      after: () => {},
    })(request(submittedUrl, "text/plain"));

    expect(response.status).toBe(415);
  });
});
