import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  agentRunId,
  operatorId,
  policyRunId,
  sourceEvidencePreparationId,
  sourceId,
  storyId,
  type AgentRun,
  type AgentRunId,
  type AgentToolCall,
  type PolicyRun,
} from "@/domain/editorial";

import { createReconcileAbandonedWork } from "./reconcile-abandoned-work";

const STORY = storyId("story-reconcile");
const OPERATOR = { type: "operator" as const, operatorId: operatorId("operator-reconcile") };
const NOW = "2026-08-23T12:00:00.000Z";

const policyRun = (overrides: Partial<PolicyRun> = {}): PolicyRun =>
  ({
    id: policyRunId("policy-1"),
    storyId: STORY,
    sourceId: null,
    policy: "autopilot",
    requestedBy: OPERATOR,
    research: false,
    startedAt: "2026-08-23T11:00:00.000Z",
    step: "writer_draft",
    observedAt: "2026-08-23T11:05:00.000Z",
    status: "running",
    ...overrides,
  }) as PolicyRun;

const runningAgentRun = (outcome: "running" | "succeeded" = "running"): AgentRun =>
  ({
    id: agentRunId("run-reconcile"),
    storyId: STORY,
    profileId: agentProfileId("writer-reconcile"),
    role: "writer",
    operation: "article_draft",
    model: { provider: "openrouter", model: "writer" },
    prompt: { key: "storyrail_writer_draft", version: "1" },
    requestedBy: OPERATOR,
    startedAt: "2026-08-23T11:05:00.000Z",
    completedAt: outcome === "running" ? null : "2026-08-23T11:06:00.000Z",
    input: {
      story: { id: STORY, title: "Story", state: "assigned", revisionCycle: 0 },
      assignment: {
        id: "assignment-reconcile" as never,
        storyId: STORY,
        writerProfileId: agentProfileId("writer-reconcile"),
        sourceIds: [sourceId("source-reconcile")],
        angle: "Angle",
        brief: "Brief",
        constraints: null,
      },
      evidence: [
        {
          sourceId: sourceId("source-reconcile"),
          relevance: "Primary",
          evidenceKind: "prepared",
          evidenceId: sourceEvidencePreparationId("prepared-reconcile"),
        },
      ],
      unavailableSourceIds: [],
    },
    ...(outcome === "running"
      ? { outcome: "running" }
      : { outcome: "succeeded", articleId: "a" as never, revisionId: "r" as never }),
  }) as AgentRun;

function harness(options: {
  readonly stale?: readonly PolicyRun[];
  readonly runs?: readonly AgentRun[];
  readonly toolCalls?: readonly AgentToolCall[];
}) {
  const completeToolCall = vi.fn(async (call: AgentToolCall) => ({ ok: true as const, call }));
  const listByStoryId = vi.fn(async () => options.runs ?? []);
  const settle = vi.fn(async (command: { id: unknown }) => ({
    ok: true as const,
    run: policyRun({ id: command.id as never }),
  }));
  const complete = vi.fn(async (run: AgentRun) => ({ ok: true as const, run }));
  return {
    settle,
    complete,
    completeToolCall,
    listByStoryId,
    reconcile: createReconcileAbandonedWork({
      policyRuns: {
        append: vi.fn(),
        observe: vi.fn(),
        settle,
        findById: vi.fn(),
        findByStoryId: vi.fn(),
        listStaleRunning: vi.fn(async () => options.stale ?? []),
      },
      agentRuns: {
        append: vi.fn(),
        complete,
        listByStoryId,
      },
      toolCalls: {
        append: vi.fn(),
        complete: completeToolCall,
        listByRunId: vi.fn(async () => options.toolCalls ?? []),
      },
      now: () => NOW,
    }),
  };
}

describe("closing out work whose process disappeared", () => {
  it("abandons a policy that has reported nothing, saying where it stopped", async () => {
    const test = harness({ stale: [policyRun()] });

    const report = await test.reconcile();

    expect(report.abandonedPolicyRuns).toHaveLength(1);
    expect(test.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: "abandoned",
        reason: expect.stringContaining("writer_draft"),
        completedAt: NOW,
      }),
    );
  });

  it("closes the runs the policy left in flight, and names why", async () => {
    // A run stuck at 'running' is polled by the workspace forever, and calling it a model
    // failure would send the operator looking for a provider problem that never happened.
    const test = harness({ stale: [policyRun()], runs: [runningAgentRun()] });

    const report = await test.reconcile();

    expect(report.abandonedAgentRuns).toHaveLength(1);
    expect(test.complete.mock.calls[0]?.[0]).toMatchObject({
      outcome: "failed",
      completedAt: NOW,
      failure: { code: "MODEL_RUN_ABANDONED", retryable: true },
    });
  });

  it("closes the agent runs before settling the policy that owned them", async () => {
    // A settled policy must never point at work still claiming to be in flight.
    const order: string[] = [];
    const test = harness({ stale: [policyRun()], runs: [runningAgentRun()] });
    test.complete.mockImplementation(async (run) => {
      order.push("agent run");
      return { ok: true as const, run };
    });
    test.settle.mockImplementation(async (command) => {
      order.push("policy");
      return { ok: true as const, run: policyRun({ id: command.id as never }) };
    });

    await test.reconcile();

    expect(order).toEqual(["agent run", "policy"]);
  });

  it("leaves finished runs alone", async () => {
    const test = harness({ stale: [policyRun()], runs: [runningAgentRun("succeeded")] });

    const report = await test.reconcile();

    expect(report.abandonedAgentRuns).toHaveLength(0);
    expect(test.complete).not.toHaveBeenCalled();
  });

  it("settles a stale Source-rooted policy without looking for Story agent runs", async () => {
    const sourceRooted = policyRun({
      storyId: null,
      sourceId: sourceId("source-reconcile-root"),
      step: "source_preparation",
    });
    const test = harness({ stale: [sourceRooted] });

    const report = await test.reconcile();

    expect(report.abandonedPolicyRuns).toHaveLength(1);
    expect(test.settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: sourceRooted.id, conclusion: "abandoned" }),
    );
    expect(test.complete).not.toHaveBeenCalled();
    expect(test.listByStoryId).not.toHaveBeenCalled();
  });

  it("does nothing when everything is still reporting progress", async () => {
    const test = harness({});

    await expect(test.reconcile()).resolves.toEqual({
      abandonedPolicyRuns: [],
      abandonedAgentRuns: [],
      abandonedToolCalls: [],
    });
    expect(test.settle).not.toHaveBeenCalled();
  });

  it("does not process an earlier policy's tool calls again for a later policy", async () => {
    const first = runningAgentRun();
    const second = { ...runningAgentRun(), id: agentRunId("run-reconcile-second") } as AgentRun;
    const listByStoryId = vi.fn().mockResolvedValueOnce([first]).mockResolvedValueOnce([second]);
    const listByRunId = vi.fn(async (id: AgentRunId) => {
      void id;
      return [];
    });
    const reconcile = createReconcileAbandonedWork({
      policyRuns: {
        append: vi.fn(),
        observe: vi.fn(),
        settle: vi.fn(async (command: { id: unknown }) => ({
          ok: true as const,
          run: policyRun({ id: command.id as never }),
        })),
        findById: vi.fn(),
        findByStoryId: vi.fn(),
        listStaleRunning: vi.fn(async () => [
          policyRun({ id: policyRunId("policy-first") }),
          policyRun({ id: policyRunId("policy-second") }),
        ]),
      },
      agentRuns: {
        append: vi.fn(),
        complete: vi.fn(async (run: AgentRun) => ({ ok: true as const, run })),
        listByStoryId,
      },
      toolCalls: { append: vi.fn(), complete: vi.fn(), listByRunId },
      now: () => NOW,
    });

    await reconcile();

    expect(listByRunId.mock.calls.map(([id]) => id)).toEqual([first.id, second.id]);
  });
});
