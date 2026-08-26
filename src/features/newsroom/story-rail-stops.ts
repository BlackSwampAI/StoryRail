import type { AgentRun, StoryState } from "@/domain/editorial";

import { modelFailureMessage } from "./model-failure";

export type StoryRailStopId =
  "intake" | "assigned" | "drafting" | "review" | "approved" | "published" | "delivered";

export interface StoryRailStop {
  readonly id: StoryRailStopId;
  readonly label: string;
  /** What happens at this stop, so an operator who has never run a Story knows the shape of it. */
  readonly summary: string;
}

/**
 * The whole journey, named in the order a Story travels it.
 *
 * Delivery is a stop of its own rather than part of publication, because they are two separate
 * editorial decisions: publishing releases the Article here and delivering sends it to the site.
 * An operator who published two Stories and could not tell whether anything had been sent was
 * reading a rail that showed only one of those decisions.
 */
export const STORY_RAIL_STOPS: readonly StoryRailStop[] = [
  {
    id: "intake",
    label: "Intake",
    summary: "Evidence is gathered and a Writer is chosen for the Story.",
  },
  {
    id: "assigned",
    label: "Assigned",
    summary: "The Writer has the brief and writes the first draft from it.",
  },
  {
    id: "drafting",
    label: "Drafting",
    summary: "A draft exists and can be revised before anyone else reads it.",
  },
  {
    id: "review",
    label: "Review",
    summary: "The Director reads the draft, and the call on it is yours.",
  },
  {
    id: "approved",
    label: "Approved",
    summary: "The draft is cleared and waiting to be released.",
  },
  {
    id: "published",
    label: "Published",
    summary: "The Story is released here, with the reason it was released.",
  },
  {
    id: "delivered",
    label: "Delivered",
    summary: "The Article is sent to the site you publish on.",
  },
];

/**
 * Which stop a Story stands at. Two states share Drafting: a Story with a first draft and one
 * sent back for changes are both a draft being worked on, and splitting them would put a stop on
 * the rail that most Stories never visit.
 */
const STOP_FOR_STATE: Readonly<Record<Exclude<StoryState, "rejected">, StoryRailStopId>> = {
  intake: "intake",
  assigned: "assigned",
  in_progress: "drafting",
  changes_requested: "drafting",
  in_review: "review",
  approved: "approved",
  published: "published",
};

export type StoryRailPosition = "behind" | "current" | "ahead";

export interface PositionedRailStop extends StoryRailStop {
  readonly position: StoryRailPosition;
}

export interface StoryRailReading {
  readonly stops: readonly PositionedRailStop[];
  /**
   * A rejected Story has left the rail rather than reached a station on it, so it has no current
   * stop at all — only the point it travelled as far as.
   */
  readonly offRail: boolean;
  readonly leftFrom: StoryRailStop | null;
}

export function resolveStoryRail(input: {
  readonly state: StoryState;
  /** Whether a delivery to the destination has been accepted, which is the last stop. */
  readonly delivered: boolean;
  /** The state a rejected Story was in when work on it ended. */
  readonly leftFrom?: StoryState;
}): StoryRailReading {
  if (input.state === "rejected") {
    const reachedId =
      input.leftFrom === undefined || input.leftFrom === "rejected"
        ? null
        : STOP_FOR_STATE[input.leftFrom];
    const reachedIndex =
      reachedId === null ? -1 : STORY_RAIL_STOPS.findIndex((stop) => stop.id === reachedId);
    return {
      stops: STORY_RAIL_STOPS.map((stop, index) => ({
        ...stop,
        position: index <= reachedIndex ? "behind" : "ahead",
      })),
      offRail: true,
      leftFrom: reachedIndex === -1 ? null : (STORY_RAIL_STOPS[reachedIndex] ?? null),
    };
  }

  const currentId: StoryRailStopId =
    input.state === "published" && input.delivered ? "delivered" : STOP_FOR_STATE[input.state];
  const currentIndex = STORY_RAIL_STOPS.findIndex((stop) => stop.id === currentId);
  return {
    stops: STORY_RAIL_STOPS.map((stop, index) => ({
      ...stop,
      position: index < currentIndex ? "behind" : index === currentIndex ? "current" : "ahead",
    })),
    offRail: false,
    leftFrom: null,
  };
}

/**
 * What the newsroom is doing at this moment, in the register of the activity panel.
 *
 * Read from the runs rather than from a local flag, because the primary way this is watched is
 * with nobody clicking: a run started somewhere else, or rejoined after a reload, has to say
 * what it is doing just as loudly as one the watcher started themselves.
 */
export function railActivity(runs: readonly AgentRun[]): string | null {
  const running = runs.filter((run) => run.outcome === "running");
  if (running.length === 0) return null;
  const describe = (run: AgentRun): string => {
    switch (run.role) {
      case "researcher":
        return "The Researcher is looking for Sources to corroborate this Story.";
      case "assignment_editor":
        return "The Assignment Editor is choosing a Writer and drawing up the brief.";
      case "writer":
        return run.operation === "article_revision"
          ? "The Writer is revising the Article."
          : "The Writer is drafting the Article.";
      case "editor_in_chief":
        return "The Director is reading the draft against the evidence behind it.";
    }
  };
  return describe(running[running.length - 1] as AgentRun);
}

/**
 * A failure a watcher has to be told about without opening anything.
 *
 * Only the newest run counts: an older refusal that has since been run again successfully is
 * history, and putting it on the rail would report a Story as broken while it was moving.
 */
export function railFailure(runs: readonly AgentRun[]): string | null {
  const latest = runs[runs.length - 1];
  if (!latest || latest.outcome !== "failed") return null;
  const labels: Readonly<Record<AgentRun["role"], string>> = {
    researcher: "Research",
    assignment_editor: "The Assignment Editor",
    writer: "The Writer",
    editor_in_chief: "The Director",
  };
  return modelFailureMessage(labels[latest.role], latest.failure);
}

/**
 * Where the Story stands, in one word, for somewhere too small to draw the whole rail.
 *
 * The rail itself scrolls with the workspace, so an operator reading down a long Article would
 * otherwise lose sight of the Story's position exactly when they are least likely to be looking
 * for it. This is what the pinned band carries instead.
 */
export function railPositionLabel(input: {
  readonly state: StoryState;
  readonly delivered: boolean;
}): string {
  const reading = resolveStoryRail(input);
  if (reading.offRail) return "Off the rail";
  return reading.stops.find((stop) => stop.position === "current")?.label ?? "Intake";
}
