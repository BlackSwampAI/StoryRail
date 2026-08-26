import type { PolicyRunStep, StoryState } from "@/domain/editorial";

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

/**
 * What each step of an automated run is doing, in the words an operator would use.
 *
 * The Story rail carries this once a Story exists. These are for the minutes before one does:
 * a run started from a URL is preserving, extracting and preparing evidence, and a watcher with
 * nothing to look at cannot tell a slow model from a dead process.
 */
export const POLICY_RUN_STEP_LABELS = {
  source_intake: "Preserving and extracting the page",
  source_preparation: "Preparing the evidence",
  story_creation: "Opening a Story",
  source_attachment: "Attaching the Source",
  source_triage: "Recording what the evidence is for",
  source_research: "Looking for more Sources",
  assignment_proposal: "Proposing an assignment",
  assignment: "Assigning the Story",
  writer_draft: "Writing the draft",
  review_submission: "Submitting for review",
  director_review: "Reviewing the Article",
  review_decision: "Recording the review decision",
  writer_revision: "Revising the Article",
  publication: "Publishing",
  delivery: "Delivering to the destination",
} as const satisfies Readonly<Record<PolicyRunStep, string>>;
