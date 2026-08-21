import type { AgentRunStarted } from "@/application/agent-runs";

/**
 * Supervised agent workflows resolve once the run is durably in flight. Tests that assert on the
 * eventual outcome wait for the completion the workflow handed back.
 */
export async function settleAgentRun<Result, Failure extends { readonly ok: false }>(
  started: AgentRunStarted<Result> | Failure | Promise<AgentRunStarted<Result> | Failure>,
): Promise<Result | Failure> {
  const resolved = await started;
  return resolved.ok ? await resolved.completion : resolved;
}
