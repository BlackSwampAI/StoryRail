import type { SourceId, SourceTriageDecision, StoryId } from "@/domain/editorial";

export interface SourceTriageSourceNotFoundError {
  readonly code: "SOURCE_NOT_FOUND";
  readonly message: "The Source to triage does not exist.";
  readonly sourceId: SourceId;
}

export interface SourceAlreadyAttachedError {
  readonly code: "SOURCE_ALREADY_ATTACHED";
  readonly message: "A Source already attached to a Story cannot be skipped.";
  readonly sourceId: SourceId;
}

export interface StorySourceAttachmentNotFoundError {
  readonly code: "STORY_SOURCE_ATTACHMENT_NOT_FOUND";
  readonly message: "The Source must be attached to the selected Story before triage.";
  readonly sourceId: SourceId;
  readonly storyId: StoryId;
}

export interface SourceTriageConflictError {
  readonly code: "SOURCE_TRIAGE_CONFLICT";
  readonly message: "A different final triage decision already exists for this Source.";
  readonly sourceId: SourceId;
}

export type RecordSourceTriageDecisionResult =
  | { readonly ok: true; readonly triageDecision: SourceTriageDecision }
  | {
      readonly ok: false;
      readonly error:
        | SourceTriageSourceNotFoundError
        | SourceAlreadyAttachedError
        | StorySourceAttachmentNotFoundError
        | SourceTriageConflictError;
    };

export interface SourceTriageDecisionRepository {
  record(decision: SourceTriageDecision): Promise<RecordSourceTriageDecisionResult>;
  findBySourceId(sourceId: SourceId): Promise<SourceTriageDecision | null>;
}
