import type { StoryInspection } from "@/application/story-inspection";

import { modelFailureExplanation } from "./model-failure";
import { STORY_STATE_LABELS } from "./newsroom-state";

/**
 * How long the workspace waits for autopilot to show progress before it concludes the run has
 * stopped. Autopilot's steps run back to back, so the gaps between them are far shorter than
 * this; a longer silence with nothing in flight means the sequence ended rather than paused.
 */
export const AUTOPILOT_IDLE_STOP_MS = 45_000;

export type AutopilotFollow =
  { readonly kind: "following" } | { readonly kind: "settled"; readonly message: string };

type Observed = Pick<StoryInspection, "story" | "agentRuns">;

/**
 * Everything autopilot can change about a Story that the operator can see. Following an
 * automated run means watching the durable record advance, not trusting a local flag: a
 * reloaded page rejoins the same run, and a stalled one is visible as silence.
 */
export function autopilotProgress(inspection: Observed): string {
  return [
    inspection.story.state,
    inspection.story.revisionCycle,
    ...inspection.agentRuns.map((run) => `${run.id}:${run.outcome}`),
  ].join("|");
}

/**
 * Decides whether the workspace should keep following an autopilot run.
 *
 * The existing in-flight poll follows a single run and stops as soon as nothing is running.
 * Autopilot leaves brief gaps between steps where that is true, so following it needs its own
 * end condition: the Story reaching publication, a run failing, or the record going quiet.
 */
export function resolveAutopilotFollow(input: {
  readonly inspection: Observed;
  /** Runs that already existed when autopilot started, so an older failure is not read as this one. */
  readonly priorRunIds: ReadonlySet<string>;
  readonly unchangedForMs: number;
}): AutopilotFollow {
  const { story, agentRuns } = input.inspection;
  if (story.state === "published")
    return { kind: "settled", message: "Autopilot published the Story." };

  const failed = agentRuns.find(
    (run) => run.outcome === "failed" && !input.priorRunIds.has(run.id),
  );
  if (failed !== undefined && failed.outcome === "failed")
    return {
      kind: "settled",
      message: `Autopilot stopped: ${modelFailureExplanation(failed.failure.code)} (${failed.failure.code}) The Story is ${STORY_STATE_LABELS[story.state]}.`,
    };

  const running = agentRuns.some((run) => run.outcome === "running");
  if (!running && input.unchangedForMs >= AUTOPILOT_IDLE_STOP_MS)
    return {
      kind: "settled",
      message: `Autopilot stopped with the Story ${STORY_STATE_LABELS[story.state]}. Take it from here.`,
    };

  return { kind: "following" };
}
