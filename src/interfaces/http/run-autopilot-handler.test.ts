// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { agentRunId, operatorId, storyId } from "@/domain/editorial";
import { AssignmentEditorRuntimeConfigurationError } from "@/runtime";

import type { AutopilotRuntimes } from "./autopilot-sequence";
import { createRunAutopilotHttpHandler } from "./run-autopilot-handler";

const identity = storyId("story-http-autopilot");
const runId = agentRunId("run-http-autopilot");
const requestedBy = { type: "operator" as const, operatorId: operatorId("operator-autopilot") };
const context = { params: Promise.resolve({ storyId: identity }) };
const request = (body = "{}", contentType = "application/json") =>
  new Request(`http://storyrail.test/api/stories/${identity}/autopilot`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
const environment = {
  NODE_ENV: "test",
  STORYRAIL_OPERATOR_ID: "operator-autopilot",
} as NodeJS.ProcessEnv;

function harness(generateAssignmentProposal: ReturnType<typeof vi.fn>) {
  return {
    story: {},
    assignmentEditor: { generateAssignmentProposal },
    writer: {},
    director: {},
  } as unknown as AutopilotRuntimes;
}

describe("run autopilot HTTP handler", () => {
  it("accepts the run and answers with its identity without waiting for the sequence", async () => {
    // The sequence is exercised in autopilot-sequence.test.ts; here it only needs to be
    // outstanding when the response is produced, then settle so the scheduled task finishes.
    let settle: () => void = () => {};
    const completion = new Promise<unknown>((resolve) => {
      settle = () => resolve({ ok: false, error: { code: "STORY_NOT_FOUND", message: "Gone." } });
    });
    const generateAssignmentProposal = vi.fn(async () => ({ ok: true, runId, completion }));
    const scheduled: (() => Promise<void>)[] = [];
    const response = await createRunAutopilotHttpHandler({
      getRuntimes: () => harness(generateAssignmentProposal),
      environment,
      after: (task) => scheduled.push(task),
    })(request(), context);

    // The response is produced while the rest of the sequence is still outstanding.
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, runId });
    expect(generateAssignmentProposal).toHaveBeenCalledWith({ storyId: identity, requestedBy });
    expect(scheduled).toHaveLength(1);
    settle();
    await Promise.all(scheduled.map((task) => task()));
  });

  it.each([
    [404, "STORY_NOT_FOUND"],
    [409, "ASSIGNMENT_PROPOSAL_NOT_ALLOWED"],
    [409, "AGENT_RUN_ID_CONFLICT"],
    [422, "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED"],
    [422, "WRITER_PROFILE_REQUIRED"],
  ] as const)("refuses to start and maps %s %s", async (expectedStatus, code) => {
    const scheduled: (() => Promise<void>)[] = [];
    const response = await createRunAutopilotHttpHandler({
      getRuntimes: () =>
        harness(
          vi.fn(async () => ({
            ok: false,
            error: { code, message: "Refused.", storyId: identity },
          })),
        ),
      environment,
      after: (task) => scheduled.push(task),
    })(request(), context);

    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
    // Nothing was scheduled, so no step of the sequence can run.
    expect(scheduled).toHaveLength(0);
  });

  it("passes an explicit research request through to the sequence", async () => {
    // Research is opt-in per run, because the cost is per run and the operator is present.
    const generateAssignmentProposal = vi.fn(async () => ({
      ok: false,
      error: { code: "STORY_NOT_FOUND", message: "Gone.", storyId: identity },
    }));
    const researchStorySources = vi.fn(async () => ({
      ok: false,
      error: { code: "RESEARCH_EVIDENCE_REQUIRED", message: "Nothing." },
    }));
    const runtimes = {
      story: {},
      assignmentEditor: { generateAssignmentProposal },
      writer: {},
      director: {},
      researcher: { researchStorySources },
    } as unknown as AutopilotRuntimes;

    await createRunAutopilotHttpHandler({
      getRuntimes: () => runtimes,
      environment,
      after: () => {},
    })(request('{"research":true}'), context);

    expect(researchStorySources).toHaveBeenCalledOnce();
  });

  it.each([
    [415, "UNSUPPORTED_MEDIA_TYPE", "{}", "text/plain"],
    [400, "INVALID_JSON", "not json", "application/json"],
    [400, "INVALID_REQUEST", '{"storyId":"x"}', "application/json"],
    [400, "INVALID_REQUEST", '{"research":"yes"}', "application/json"],
  ] as const)("rejects %s %s", async (expectedStatus, code, body, contentType) => {
    const generateAssignmentProposal = vi.fn();
    const response = await createRunAutopilotHttpHandler({
      getRuntimes: () => harness(generateAssignmentProposal),
      environment,
      after: () => {},
    })(request(body, contentType), context);

    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toMatchObject({ ok: false, error: { code } });
    expect(generateAssignmentProposal).not.toHaveBeenCalled();
  });

  it("reports autopilot as unavailable when a runtime is not configured", async () => {
    const response = await createRunAutopilotHttpHandler({
      getRuntimes: () => {
        throw new AssignmentEditorRuntimeConfigurationError();
      },
      environment,
      after: () => {},
    })(request(), context);

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "AUTOPILOT_UNAVAILABLE" },
    });
  });

  it("does not start a run when no operator is configured", async () => {
    const generateAssignmentProposal = vi.fn();
    const response = await createRunAutopilotHttpHandler({
      getRuntimes: () => harness(generateAssignmentProposal),
      environment: { NODE_ENV: "test" } as NodeJS.ProcessEnv,
      after: () => {},
    })(request(), context);

    expect(response.status).toBe(500);
    expect(generateAssignmentProposal).not.toHaveBeenCalled();
  });
});
