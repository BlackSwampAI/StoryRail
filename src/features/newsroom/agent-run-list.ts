import type { AgentRun } from "@/domain/editorial";

/**
 * A Story with a run in flight is polled, so the authoritative list can already carry the run a
 * handler is still waiting on. Appending blindly then held the same run twice, which React reported
 * as two children with the same key. The handler's copy is the newer account of that record, so it
 * replaces the polled one in place rather than being added a second time.
 */
export function withRun(current: readonly AgentRun[], run: AgentRun): readonly AgentRun[] {
  return current.some(({ id }) => id === run.id)
    ? current.map((existing) => (existing.id === run.id ? run : existing))
    : [...current, run];
}
