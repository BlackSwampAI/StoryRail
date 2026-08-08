import type { StoryState, StoryTransitionCommand, StoryTransitionResult } from "./types";

export const MAX_REVISION_CYCLES = 2;

export const PERMITTED_STORY_TRANSITIONS = {
  intake: ["assigned", "rejected"],
  assigned: ["in_progress", "rejected"],
  in_progress: ["in_review", "rejected"],
  in_review: ["changes_requested", "approved", "rejected"],
  changes_requested: ["in_progress", "rejected"],
  approved: ["published"],
  rejected: [],
  published: [],
} as const satisfies Readonly<Record<StoryState, readonly StoryState[]>>;

type OperatorOnlyState = "approved" | "rejected" | "published";

const OPERATOR_ONLY_STATES = new Set<StoryState>(["approved", "rejected", "published"]);

function isOperatorOnlyState(state: StoryState): state is OperatorOnlyState {
  return OPERATOR_ONLY_STATES.has(state);
}

function isPermittedTransition(previousState: StoryState, nextState: StoryState): boolean {
  const permittedStates: readonly StoryState[] = PERMITTED_STORY_TRANSITIONS[previousState];

  return permittedStates.includes(nextState);
}

export function transitionStory({
  story,
  nextState,
  actor,
  reason,
  transitionId,
  occurredAt,
}: StoryTransitionCommand): StoryTransitionResult {
  const previousState = story.state;
  const editorialReason = reason.trim();

  if (editorialReason.length === 0) {
    return {
      ok: false,
      error: {
        code: "REASON_REQUIRED",
        message: "A non-empty editorial reason is required for every transition.",
        previousState,
        nextState,
      },
    };
  }

  if (!isPermittedTransition(previousState, nextState)) {
    return {
      ok: false,
      error: {
        code: "INVALID_TRANSITION",
        message: `A story cannot transition from ${previousState} to ${nextState}.`,
        previousState,
        nextState,
      },
    };
  }

  if (isOperatorOnlyState(nextState) && actor.type !== "operator") {
    return {
      ok: false,
      error: {
        code: "OPERATOR_REQUIRED",
        message: `Only an operator can transition a story to ${nextState}.`,
        previousState,
        nextState,
        actorType: actor.type,
      },
    };
  }

  if (
    previousState === "in_review" &&
    nextState === "changes_requested" &&
    story.revisionCycle >= MAX_REVISION_CYCLES
  ) {
    return {
      ok: false,
      error: {
        code: "REVISION_LIMIT_REACHED",
        message: `A story cannot exceed ${MAX_REVISION_CYCLES} changes-requested cycles.`,
        previousState,
        nextState,
        revisionCycle: story.revisionCycle,
        maximumRevisionCycles: MAX_REVISION_CYCLES,
      },
    };
  }

  const revisionCycle =
    previousState === "in_review" && nextState === "changes_requested"
      ? story.revisionCycle + 1
      : story.revisionCycle;

  const transitionedStory = {
    ...story,
    state: nextState,
    revisionCycle,
    updatedAt: occurredAt,
  };

  return {
    ok: true,
    story: transitionedStory,
    receipt: {
      transitionId,
      storyId: story.id,
      previousState,
      nextState,
      actor,
      reason: editorialReason,
      occurredAt,
      revisionCycle,
    },
  };
}
