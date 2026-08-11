import type { AgentProfileId, AssignmentId, EditorialActor, SourceId, StoryId } from "./types";

export interface Assignment {
  readonly id: AssignmentId;
  readonly storyId: StoryId;
  readonly writerProfileId: AgentProfileId;
  readonly sourceIds: readonly SourceId[];
  readonly angle: string;
  readonly brief: string;
  readonly constraints: string | null;
  readonly assignedBy: EditorialActor;
  readonly assignedAt: string;
}

export interface CreateAssignmentCommand {
  readonly id: AssignmentId;
  readonly storyId: StoryId;
  readonly writerProfileId: AgentProfileId;
  readonly sourceIds: readonly SourceId[];
  readonly angle: unknown;
  readonly brief: unknown;
  readonly constraints: unknown;
  readonly assignedBy: EditorialActor;
  readonly assignedAt: string;
}

export type AssignmentValidationCode =
  | "ASSIGNMENT_ANGLE_REQUIRED"
  | "ASSIGNMENT_BRIEF_REQUIRED"
  | "ASSIGNMENT_CONSTRAINTS_INVALID"
  | "ASSIGNMENT_WRITER_PROFILE_REQUIRED"
  | "ASSIGNMENT_ACTOR_NOT_ALLOWED"
  | "ASSIGNMENT_SOURCE_DUPLICATE";

export interface AssignmentValidationError {
  readonly code: AssignmentValidationCode;
  readonly message: string;
}

export type CreateAssignmentResult =
  | { readonly ok: true; readonly assignment: Assignment }
  | { readonly ok: false; readonly error: AssignmentValidationError };
