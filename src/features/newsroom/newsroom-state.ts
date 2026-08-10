import type { StoryState } from "@/domain/editorial";

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
