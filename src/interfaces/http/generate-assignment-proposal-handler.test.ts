// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { GenerateAssignmentProposalResult } from "@/application/assignment-proposals";

import { agentProfileId, agentRunId, operatorId, storyId, type AgentRun } from "@/domain/editorial";
import { AssignmentEditorRuntimeConfigurationError, type AssignmentEditorRuntime } from "@/runtime";

import { createGenerateAssignmentProposalHttpHandler } from "./generate-assignment-proposal-handler";

const run: AgentRun = {
  id: agentRunId("run-http-0030"),
  storyId: storyId("story-http-0030"),
  profileId: agentProfileId("storyrail-assignment-editor-v1"),
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-http-0030") },
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: { id: storyId("story-http-0030"), title: "Story", state: "intake", revisionCycle: 0 },
    evidence: [],
    unavailableSourceIds: [],
    writerProfileIds: [agentProfileId("writer-http-0030")],
  },
  outcome: "failed",
  failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
};
const context = { params: Promise.resolve({ storyId: run.storyId }) };
const request = (body = "{}", contentType = "application/json") =>
  new Request(`http://storyrail.test/api/stories/${run.storyId}/assignment-proposals`, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });

describe("generate Assignment proposal HTTP handler", () => {
  it("accepts a started run and returns its identity without waiting for the model", async () => {
    let settle: (value: GenerateAssignmentProposalResult) => void = () => {};
    const completion = new Promise<GenerateAssignmentProposalResult>((resolve) => {
      settle = resolve;
    });
    const generateAssignmentProposal = vi.fn(async () => ({
      ok: true as const,
      runId: run.id,
      completion,
    }));
    const runtime = { generateAssignmentProposal, close: vi.fn() } as AssignmentEditorRuntime;
    const scheduled: (() => Promise<void>)[] = [];
    const response = await createGenerateAssignmentProposalHttpHandler({
      getRuntime: () => runtime,
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-http-0030" },
      after: (task) => scheduled.push(task),
    })(request(), context);

    // The response is produced while the model call is still outstanding.
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, runId: run.id });
    expect(generateAssignmentProposal).toHaveBeenCalledWith({
      storyId: run.storyId,
      requestedBy: run.requestedBy,
    });
    settle({ ok: true, run });
    expect(scheduled).toHaveLength(1);
    await Promise.all(scheduled.map((task) => task()));
  });

  it.each([
    [404, "STORY_NOT_FOUND"],
    [409, "ASSIGNMENT_PROPOSAL_NOT_ALLOWED"],
    [422, "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED"],
    [422, "WRITER_PROFILE_REQUIRED"],
  ] as const)("maps %s %s safely", async (expectedStatus, code) => {
    const runtime = {
      generateAssignmentProposal: vi.fn(async () => ({
        ok: false as const,
        error: { code, message: "Safe expected failure.", storyId: run.storyId },
      })),
      close: vi.fn(),
    } as unknown as AssignmentEditorRuntime;
    const response = await createGenerateAssignmentProposalHttpHandler({
      getRuntime: () => runtime,
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-http-0030" },
    })(request(), context);
    expect(response.status).toBe(expectedStatus);
  });

  it("requires application/json and an exact empty object before runtime access", async () => {
    const getRuntime = vi.fn();
    const handler = createGenerateAssignmentProposalHttpHandler({ getRuntime });
    expect((await handler(request("{}", "text/plain"), context)).status).toBe(415);
    expect((await handler(request("{"), context)).status).toBe(400);
    expect((await handler(request('{"model":"unsafe"}'), context)).status).toBe(400);
    expect(getRuntime).not.toHaveBeenCalled();
  });

  it("returns a safe 503 for missing execution configuration and redacts unexpected failures", async () => {
    const unavailable = createGenerateAssignmentProposalHttpHandler({
      getRuntime: () => {
        throw new AssignmentEditorRuntimeConfigurationError(
          "STORYRAIL_ASSIGNMENT_EDITOR_MODEL_REQUIRED",
        );
      },
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-http-0030" },
    });
    expect((await unavailable(request(), context)).status).toBe(503);

    const failed = createGenerateAssignmentProposalHttpHandler({
      getRuntime: () => {
        throw new Error("postgresql://secret");
      },
      environment: { NODE_ENV: "test", STORYRAIL_OPERATOR_ID: "operator-http-0030" },
    });
    const response = await failed(request(), context);
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
