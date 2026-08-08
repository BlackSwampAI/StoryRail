import { STORY_STATES, storyId, type Story, type StoryState } from "@/domain/editorial";

export const STORY_STATE_LABELS = {
  intake: "Intake",
  assigned: "Assigned",
  in_progress: "In progress",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved",
  rejected: "Rejected",
  published: "Published",
} as const satisfies Readonly<Record<StoryState, string>>;

export interface NewsroomStoryFixture extends Story {
  readonly summary: string;
  readonly sourceCount: number;
  readonly assignedRole: string;
  readonly lastActivity: string;
}

export const NEWSROOM_STORIES = [
  {
    id: storyId("story-mcu-0001"),
    title: "The Midnight Archive opens a new continuity question",
    state: "intake",
    revisionCycle: 0,
    createdAt: "2026-08-06T13:10:00.000Z",
    updatedAt: "2026-08-08T14:30:00.000Z",
    summary:
      "Assess whether the fictional Midnight Archive concept supports a focused continuity explainer.",
    sourceCount: 3,
    assignedRole: "Unassigned",
    lastActivity: "Source notes collected for desk review.",
  },
  {
    id: storyId("story-mcu-0002"),
    title: "A field guide to the fictional Nova Harbor team",
    state: "intake",
    revisionCycle: 0,
    createdAt: "2026-08-07T09:20:00.000Z",
    updatedAt: "2026-08-08T12:15:00.000Z",
    summary:
      "Shape a newcomer-friendly briefing around an invented ensemble and its possible story angles.",
    sourceCount: 2,
    assignedRole: "Unassigned",
    lastActivity: "Candidate angle added by the assignment desk.",
  },
  {
    id: storyId("story-mcu-0003"),
    title: "Map the artifacts of the imagined Meridian Vault",
    state: "assigned",
    revisionCycle: 0,
    createdAt: "2026-08-04T15:45:00.000Z",
    updatedAt: "2026-08-08T11:05:00.000Z",
    summary:
      "Prepare a bounded research brief for a fictional artifact index without turning it into a plot recap.",
    sourceCount: 4,
    assignedRole: "Assignment editor",
    lastActivity: "Assignment scope prepared for review.",
  },
  {
    id: storyId("story-mcu-0004"),
    title: "Trace the fictional Atlas Station timeline",
    state: "in_progress",
    revisionCycle: 0,
    createdAt: "2026-08-02T16:30:00.000Z",
    updatedAt: "2026-08-08T10:40:00.000Z",
    summary:
      "Build an original timeline framework for a made-up orbital setting using the supplied desk notes.",
    sourceCount: 5,
    assignedRole: "Writer",
    lastActivity: "Research outline is being assembled.",
  },
  {
    id: storyId("story-mcu-0005"),
    title: "Explain the invented Prism Protocol",
    state: "in_progress",
    revisionCycle: 1,
    createdAt: "2026-08-01T12:00:00.000Z",
    updatedAt: "2026-08-08T09:55:00.000Z",
    summary:
      "Rework a fictional technology explainer so its claims, limits, and open questions remain distinct.",
    sourceCount: 6,
    assignedRole: "Writer",
    lastActivity: "Writer is addressing the first revision brief.",
  },
  {
    id: storyId("story-mcu-0006"),
    title: "Review the Lantern District character briefing",
    state: "in_review",
    revisionCycle: 0,
    createdAt: "2026-07-30T14:25:00.000Z",
    updatedAt: "2026-08-08T08:35:00.000Z",
    summary:
      "Check an original character briefing for clarity, evidence boundaries, and a useful editorial angle.",
    sourceCount: 4,
    assignedRole: "Editor-in-chief",
    lastActivity: "Draft package submitted for editorial review.",
  },
  {
    id: storyId("story-mcu-0007"),
    title: "Clarify the fictional Wayfinder Corps chronology",
    state: "changes_requested",
    revisionCycle: 2,
    createdAt: "2026-07-28T10:15:00.000Z",
    updatedAt: "2026-08-07T18:20:00.000Z",
    summary:
      "Resolve chronology gaps in an invented team history while keeping the second revision cycle bounded.",
    sourceCount: 7,
    assignedRole: "Writer",
    lastActivity: "Second revision brief recorded by the desk.",
  },
  {
    id: storyId("story-mcu-0008"),
    title: "Package the imagined Red Comet dossier",
    state: "approved",
    revisionCycle: 1,
    createdAt: "2026-07-25T09:00:00.000Z",
    updatedAt: "2026-08-07T15:10:00.000Z",
    summary: "Hold an approved fictional dossier for a future, separate publication workflow.",
    sourceCount: 5,
    assignedRole: "Editor-in-chief",
    lastActivity: "Operator approval recorded; publication remains separate.",
  },
  {
    id: storyId("story-mcu-0009"),
    title: "Retire the speculative Quantum Orchard pitch",
    state: "rejected",
    revisionCycle: 0,
    createdAt: "2026-07-24T11:35:00.000Z",
    updatedAt: "2026-08-06T17:45:00.000Z",
    summary:
      "Preserve the desk record for a fictional pitch that did not support a distinct story.",
    sourceCount: 2,
    assignedRole: "Assignment editor",
    lastActivity: "Operator ended the Story at intake review.",
  },
] as const satisfies readonly NewsroomStoryFixture[];

export const NEWSROOM_QUEUES = STORY_STATES.map((state) => ({
  state,
  label: STORY_STATE_LABELS[state],
  count: NEWSROOM_STORIES.filter((story) => story.state === state).length,
}));
