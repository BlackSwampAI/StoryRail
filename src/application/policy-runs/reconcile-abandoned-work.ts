import type { AgentRunRepository, StaleAgentRunRepository } from "@/application/agent-runs";
import type { AgentToolCallRepository } from "@/application/agent-tools";
import type {
  StaleStoryDeliveryRepository,
  StoryDeliveryRepository,
} from "@/application/story-deliveries";
import {
  recordAgentRun,
  recordAgentToolCall,
  recordStoryDelivery,
  type AgentRun,
  type AgentToolCall,
  type PolicyRun,
  type StoryDelivery,
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
  /**
   * Deliveries settled to `unknown`, never `failed`: the request may have left before the process
   * died, so the destination may hold the page. Each now awaits operator reconciliation.
   */
  readonly abandonedDeliveries: readonly StoryDelivery[];
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
 *
 * A destination delivery is the one case where "failed" would be a lie. Its request may have
 * reached the destination before the process died, so it is settled to `unknown`, which routes
 * it into the operator reconciliation of ambiguous deliveries. Nothing is ever re-sent.
 */
export function createReconcileAbandonedWork(dependencies: {
  readonly policyRuns: PolicyRunRepository;
  readonly agentRuns: AgentRunRepository;
  readonly staleAgentRuns: StaleAgentRunRepository;
  readonly toolCalls: AgentToolCallRepository;
  readonly deliveries: StoryDeliveryRepository;
  readonly staleDeliveries: StaleStoryDeliveryRepository;
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

    const closeAgentRun = async (agentRun: AgentRun): Promise<void> => {
      if (agentRun.outcome !== "running") return;
      const recorded = recordAgentRun({
        ...agentRun,
        completedAt: now,
        outcome: "failed",
        failure: { code: "MODEL_RUN_ABANDONED", retryable: true },
      } as AgentRun);
      if (!recorded.ok) return;
      const completed = await dependencies.agentRuns.complete(recorded.run);
      // A concurrent recovery or normal completion wins. Its terminal fact must not be
      // overwritten, and this invocation must not report work it did not close.
      if (!completed.ok) return;
      abandonedAgentRuns.push(completed.run);

      for (const call of await dependencies.toolCalls.listByRunId(completed.run.id)) {
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
        const completedCall = await dependencies.toolCalls.complete(closed.call);
        if (completedCall.ok) abandonedToolCalls.push(completedCall.call);
      }
    };

    for (const run of stale) {
      // The runs the policy left behind are closed first, so a settled policy never points at
      // work still claiming to be in flight. A policy that died before it reached a Story left
      // no AgentRun behind to close: everything before story creation is extraction and
      // preparation, which are recorded against the Source rather than against a Story.
      const editorialRuns =
        run.storyId === null ? [] : await dependencies.agentRuns.listByStoryId(run.storyId);
      for (const agentRun of editorialRuns) {
        await closeAgentRun(agentRun);
      }

      const settled = await dependencies.policyRuns.settle({
        id: run.id,
        conclusion: "abandoned",
        reason: `Nothing reported progress at ${run.step} since ${run.observedAt}. The process running this policy is presumed gone.`,
        completedAt: now,
      });
      if (settled.ok) abandonedPolicyRuns.push(settled.run);
    }

    // Manual runs have no PolicyRun to age out. Once their durable intent is old enough, close
    // genuine orphans but never touch a Story still owned by any live policy. Nothing is replayed:
    // the external/model outcome is unknowable after process death, so retry remains an operator
    // decision.
    for (const agentRun of await dependencies.staleAgentRuns.listStaleRunning(threshold)) {
      const policies = await dependencies.policyRuns.findByStoryId(agentRun.storyId);
      if (policies.some((policy) => policy.status === "running")) continue;
      await closeAgentRun(agentRun);
    }

    // A delivery belongs to no policy run and no AgentRun: it is a discrete external request. Its
    // outcome is unknowable after the process dies, so it is recorded as exactly that. The
    // completion is one-way in the repository, so a normal completion that lands first wins and
    // this pass reports only what it actually closed.
    const abandonedDeliveries: StoryDelivery[] = [];
    for (const delivery of await dependencies.staleDeliveries.listStaleRunning(threshold)) {
      if (delivery.outcome !== "running") continue;
      const recorded = recordStoryDelivery({
        ...delivery,
        completedAt: now,
        outcome: "unknown",
        uncertainty: {
          code: "DESTINATION_REQUEST_OUTCOME_UNKNOWN",
          message:
            "The process making this delivery stopped before recording an outcome. The destination may or may not have received the request.",
        },
      });
      if (!recorded.ok) continue;
      const completed = await dependencies.deliveries.complete(recorded.delivery);
      if (completed.ok) abandonedDeliveries.push(completed.delivery);
    }

    return { abandonedPolicyRuns, abandonedAgentRuns, abandonedToolCalls, abandonedDeliveries };
  };
}
