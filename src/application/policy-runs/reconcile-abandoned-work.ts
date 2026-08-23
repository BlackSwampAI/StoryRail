import type { AgentRunRepository } from "@/application/agent-runs";
import type { AgentToolCallRepository } from "@/application/agent-tools";
import {
  recordAgentRun,
  recordAgentToolCall,
  type AgentRun,
  type AgentToolCall,
  type PolicyRun,
} from "@/domain/editorial";

import type { PolicyRunRepository } from "./policy-run-repository";

/**
 * How long a run may report nothing before the process driving it is presumed gone.
 *
 * Generously long on purpose. A model call can take a minute, and research can take several
 * while it retrieves pages, so a short threshold would abandon work that is merely slow — which
 * is worse than leaving a dead run visible for a while longer.
 */
export const ABANDONED_AFTER_MS = 15 * 60_000;

export interface ReconciliationReport {
  readonly abandonedPolicyRuns: readonly PolicyRun[];
  readonly abandonedAgentRuns: readonly AgentRun[];
  readonly abandonedToolCalls: readonly AgentToolCall[];
}

/**
 * Closes out work whose process disappeared.
 *
 * Every step of an editorial sequence is durable, but a process that dies between two of them
 * leaves an automation nobody is driving and, if it died mid-call, an AgentRun marked running
 * forever that the workspace polls indefinitely.
 *
 * This closes rather than resumes. Resuming would risk repeating a model call that had already
 * completed and charging for it twice, and the operator cannot tell from the record which it
 * was. Closing out states plainly what happened and leaves the next move to a person.
 */
export function createReconcileAbandonedWork(dependencies: {
  readonly policyRuns: PolicyRunRepository;
  readonly agentRuns: AgentRunRepository;
  readonly toolCalls: AgentToolCallRepository;
  readonly now: () => string;
  readonly abandonedAfterMs?: number;
}) {
  return async (): Promise<ReconciliationReport> => {
    const now = dependencies.now();
    const parsed = Date.parse(now);
    const threshold = new Date(
      (Number.isNaN(parsed) ? Date.now() : parsed) -
        (dependencies.abandonedAfterMs ?? ABANDONED_AFTER_MS),
    ).toISOString();

    const stale = await dependencies.policyRuns.listStaleRunning(threshold);
    const abandonedPolicyRuns: PolicyRun[] = [];
    const abandonedAgentRuns: AgentRun[] = [];
    const abandonedToolCalls: AgentToolCall[] = [];

    for (const run of stale) {
      // The runs the policy left behind are closed first, so a settled policy never points at
      // work still claiming to be in flight.
      for (const agentRun of await dependencies.agentRuns.listByStoryId(run.storyId)) {
        if (agentRun.outcome !== "running") continue;
        const recorded = recordAgentRun({
          ...agentRun,
          completedAt: now,
          outcome: "failed",
          failure: { code: "MODEL_RUN_ABANDONED", retryable: true },
        } as AgentRun);
        if (!recorded.ok) continue;
        const completed = await dependencies.agentRuns.complete(recorded.run);
        if (completed.ok) abandonedAgentRuns.push(completed.run);
      }

      // Tool calls left open by the same dead process are closed with the same reasoning.
      for (const agentRun of abandonedAgentRuns) {
        for (const call of await dependencies.toolCalls.listByRunId(agentRun.id)) {
          if (call.outcome !== "running") continue;
          const closed = recordAgentToolCall({
            ...call,
            completedAt: now,
            outcome: "failed",
            failure: {
              code: "TOOL_RUN_ABANDONED",
              retryable: true,
              message: "The process running this stopped while the tool was working.",
            },
          } as AgentToolCall);
          if (!closed.ok) continue;
          const completed = await dependencies.toolCalls.complete(closed.call);
          if (completed.ok) abandonedToolCalls.push(completed.call);
        }
      }

      const settled = await dependencies.policyRuns.settle({
        id: run.id,
        conclusion: "abandoned",
        reason: `Nothing reported progress at ${run.step} since ${run.observedAt}. The process running this policy is presumed gone.`,
        completedAt: now,
      });
      if (settled.ok) abandonedPolicyRuns.push(settled.run);
    }

    return { abandonedPolicyRuns, abandonedAgentRuns, abandonedToolCalls };
  };
}
