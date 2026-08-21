import type { AgentRunId } from "@/domain/editorial";

/**
 * A supervised agent run returns as soon as it is durably recorded as in flight, carrying the
 * identity the caller can follow and a promise for the eventual outcome.
 *
 * Preconditions are still checked before the caller gets a result, so a request that cannot run
 * at all fails immediately rather than being reported as started and then quietly dying. Only
 * the model call itself continues past the response.
 */
export interface AgentRunStarted<Result> {
  readonly ok: true;
  readonly runId: AgentRunId;
  readonly completion: Promise<Result>;
}

export type StartAgentRun<Result, Failure> = AgentRunStarted<Result> | Failure;
