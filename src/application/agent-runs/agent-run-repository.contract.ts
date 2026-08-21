import { isDeepStrictEqual } from "node:util";

import { beforeEach, describe, expect, it } from "vitest";

import {
  agentProfileId,
  agentRunId,
  operatorId,
  sourceId,
  sourceExtractionId,
  storyId,
  type AgentRun,
  type AgentRunId,
} from "@/domain/editorial";

import type { AgentRunRepository } from "./agent-run-repository";

function run(suffix: string): AgentRun {
  return {
    id: agentRunId(`run-contract-${suffix}`),
    storyId: storyId("story-contract-agent-runs"),
    profileId: agentProfileId("storyrail-assignment-editor-v1"),
    role: "assignment_editor",
    operation: "assignment_proposal",
    model: { provider: "openrouter", model: "provider/model" },
    prompt: { key: "storyrail_assignment_editor", version: "1" },
    requestedBy: { type: "operator", operatorId: operatorId("operator-contract") },
    startedAt: `started-${suffix}`,
    completedAt: `completed-${suffix}`,
    input: {
      story: {
        id: storyId("story-contract-agent-runs"),
        title: "Contract Story",
        state: "intake",
        revisionCycle: 0,
      },
      evidence: [
        {
          sourceId: sourceId("source-contract-agent-runs"),
          relevance: "Contract evidence",
          evidenceKind: "raw",
          evidenceId: sourceExtractionId("extraction-contract-agent-runs"),
        },
      ],
      unavailableSourceIds: [],
      writerProfileIds: [agentProfileId("writer-contract")],
    },
    outcome: "failed",
    failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
  };
}

export function createReferenceAgentRunRepository(): AgentRunRepository {
  const runs = new Map<AgentRunId, AgentRun>();
  return {
    async append(candidate) {
      const existing = runs.get(candidate.id);
      if (existing) {
        return isDeepStrictEqual(existing, candidate)
          ? { ok: true, run: structuredClone(existing) }
          : {
              ok: false,
              error: {
                code: "AGENT_RUN_ID_CONFLICT",
                message: "A different AgentRun with the same ID already exists.",
                runId: candidate.id,
              },
            };
      }
      if (
        candidate.role === "editor_in_chief" &&
        candidate.outcome === "succeeded" &&
        [...runs.values()].some(
          (run) =>
            run.role === "editor_in_chief" &&
            run.outcome === "succeeded" &&
            run.input.revision.id === candidate.input.revision.id,
        )
      )
        return {
          ok: false,
          error: {
            code: "DIRECTOR_REVIEW_ALREADY_SUCCEEDED",
            message: "The Article Revision already has a successful Director review.",
            runId: candidate.id,
          },
        };
      runs.set(candidate.id, structuredClone(candidate));
      return { ok: true, run: structuredClone(candidate) };
    },
    async complete(candidate) {
      const existing = runs.get(candidate.id);
      if (
        candidate.role === "editor_in_chief" &&
        candidate.outcome === "succeeded" &&
        [...runs.values()].some(
          (run) =>
            run.id !== candidate.id &&
            run.role === "editor_in_chief" &&
            run.outcome === "succeeded" &&
            run.input.revision.id === candidate.input.revision.id,
        )
      ) {
        return {
          ok: false,
          error: {
            code: "DIRECTOR_REVIEW_ALREADY_SUCCEEDED",
            message: "The Article Revision already has a successful Director review.",
            runId: candidate.id,
          },
        };
      }
      if (!existing || existing.outcome !== "running") {
        return {
          ok: false,
          error: {
            code: "AGENT_RUN_NOT_RUNNING",
            message: "Only an AgentRun that is still running can be completed.",
            runId: candidate.id,
          },
        };
      }
      runs.set(candidate.id, structuredClone(candidate));
      return { ok: true, run: structuredClone(candidate) };
    },
    async listByStoryId(identity) {
      return [...runs.values()]
        .filter(({ storyId: candidate }) => candidate === identity)
        .map((candidate) => structuredClone(candidate));
    },
  };
}

export function describeAgentRunRepositoryContract(
  createRepository: () => AgentRunRepository | Promise<AgentRunRepository>,
): void {
  let repository: AgentRunRepository;
  beforeEach(async () => {
    repository = await createRepository();
  });

  describe("AgentRunRepository contract", () => {
    it("appends and lists runs in durable append order with fresh results", async () => {
      const first = run("first");
      const second = run("second");
      await repository.append(first);
      await repository.append(second);
      const listed = await repository.listByStoryId(first.storyId);
      expect(listed).toEqual([first, second]);
      expect(listed[0]).not.toBe(first);
    });

    it("supports exact replay and rejects divergent same-ID records", async () => {
      const expected = run("replay");
      await expect(repository.append(expected)).resolves.toEqual({ ok: true, run: expected });
      await expect(repository.append(structuredClone(expected))).resolves.toEqual({
        ok: true,
        run: expected,
      });
      await expect(
        repository.append({ ...expected, completedAt: "different" }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "AGENT_RUN_ID_CONFLICT", runId: expected.id },
      });
    });
  });
}
