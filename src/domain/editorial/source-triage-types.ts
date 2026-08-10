import type { EditorialActor, SourceId, StoryId } from "./types";

export const SOURCE_TRIAGE_DECISION_KINDS = ["new_story", "existing_story", "skip"] as const;

export type SourceTriageDecisionKind = (typeof SOURCE_TRIAGE_DECISION_KINDS)[number];

export interface SourceTriageDecision {
  readonly sourceId: SourceId;
  readonly decision: SourceTriageDecisionKind;
  readonly storyId: StoryId | null;
  readonly reason: string;
  readonly decidedBy: EditorialActor;
  readonly decidedAt: string;
}

export interface DecideSourceTriageCommand {
  readonly sourceId: SourceId;
  readonly decision: SourceTriageDecisionKind;
  readonly storyId: StoryId | null;
  readonly reason: string;
  readonly decidedBy: EditorialActor;
  readonly decidedAt: string;
}

export interface SourceTriageReasonRequiredError {
  readonly code: "SOURCE_TRIAGE_REASON_REQUIRED";
  readonly message: "A non-empty editorial reason is required to triage a Source.";
}

export interface SourceTriageStoryRequiredError {
  readonly code: "SOURCE_TRIAGE_STORY_REQUIRED";
  readonly message: "A Story is required for a linked Source triage decision.";
}

export interface SourceTriageStoryForbiddenError {
  readonly code: "SOURCE_TRIAGE_STORY_FORBIDDEN";
  readonly message: "A skipped Source triage decision cannot reference a Story.";
}

export type DecideSourceTriageResult =
  | { readonly ok: true; readonly triageDecision: SourceTriageDecision }
  | {
      readonly ok: false;
      readonly error:
        | SourceTriageReasonRequiredError
        | SourceTriageStoryRequiredError
        | SourceTriageStoryForbiddenError;
    };
