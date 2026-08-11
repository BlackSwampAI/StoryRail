import type { AgentProfileId } from "./types";

export interface AssignmentProposal {
  readonly writerProfileId: AgentProfileId;
  readonly angle: string;
  readonly brief: string;
  readonly constraints: string | null;
  readonly reason: string;
}

export interface CreateAssignmentProposalCommand {
  readonly writerProfileId: AgentProfileId;
  readonly angle: unknown;
  readonly brief: unknown;
  readonly constraints: unknown;
  readonly reason: unknown;
}

export type AssignmentProposalValidationCode =
  | "ASSIGNMENT_PROPOSAL_WRITER_PROFILE_REQUIRED"
  | "ASSIGNMENT_PROPOSAL_ANGLE_REQUIRED"
  | "ASSIGNMENT_PROPOSAL_BRIEF_REQUIRED"
  | "ASSIGNMENT_PROPOSAL_CONSTRAINTS_INVALID"
  | "ASSIGNMENT_PROPOSAL_REASON_REQUIRED";

export type CreateAssignmentProposalResult =
  | { readonly ok: true; readonly proposal: AssignmentProposal }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: AssignmentProposalValidationCode;
        readonly message: string;
      };
    };
