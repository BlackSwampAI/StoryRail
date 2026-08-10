import type { EditorialActor } from "./types";
import type { DecideSourceTriageCommand, DecideSourceTriageResult } from "./source-triage-types";

function copyActor(actor: EditorialActor): EditorialActor {
  return actor.type === "operator"
    ? { type: "operator", operatorId: actor.operatorId }
    : { type: "agent", role: actor.role, runId: actor.runId };
}

export function decideSourceTriage(command: DecideSourceTriageCommand): DecideSourceTriageResult {
  const reason = command.reason.trim();

  if (reason.length === 0) {
    return {
      ok: false,
      error: {
        code: "SOURCE_TRIAGE_REASON_REQUIRED",
        message: "A non-empty editorial reason is required to triage a Source.",
      },
    };
  }

  if (command.decision === "skip" && command.storyId !== null) {
    return {
      ok: false,
      error: {
        code: "SOURCE_TRIAGE_STORY_FORBIDDEN",
        message: "A skipped Source triage decision cannot reference a Story.",
      },
    };
  }

  if (command.decision !== "skip" && command.storyId === null) {
    return {
      ok: false,
      error: {
        code: "SOURCE_TRIAGE_STORY_REQUIRED",
        message: "A Story is required for a linked Source triage decision.",
      },
    };
  }

  return {
    ok: true,
    triageDecision: {
      sourceId: command.sourceId,
      decision: command.decision,
      storyId: command.storyId,
      reason,
      decidedBy: copyActor(command.decidedBy),
      decidedAt: command.decidedAt,
    },
  };
}
