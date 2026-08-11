import type {
  AssignmentProposalValidationCode,
  CreateAssignmentProposalCommand,
  CreateAssignmentProposalResult,
} from "./assignment-proposal-types";

function invalid(
  code: AssignmentProposalValidationCode,
  message: string,
): CreateAssignmentProposalResult {
  return { ok: false, error: { code, message } };
}

export function createAssignmentProposal(
  command: CreateAssignmentProposalCommand,
): CreateAssignmentProposalResult {
  if (command.writerProfileId.trim().length === 0) {
    return invalid(
      "ASSIGNMENT_PROPOSAL_WRITER_PROFILE_REQUIRED",
      "A non-empty Writer Profile identity is required.",
    );
  }
  if (typeof command.angle !== "string" || command.angle.trim().length === 0) {
    return invalid(
      "ASSIGNMENT_PROPOSAL_ANGLE_REQUIRED",
      "A non-empty editorial angle is required.",
    );
  }
  if (typeof command.brief !== "string" || command.brief.trim().length === 0) {
    return invalid("ASSIGNMENT_PROPOSAL_BRIEF_REQUIRED", "A non-empty Writer brief is required.");
  }
  if (
    command.constraints !== null &&
    (typeof command.constraints !== "string" || command.constraints.trim().length === 0)
  ) {
    return invalid(
      "ASSIGNMENT_PROPOSAL_CONSTRAINTS_INVALID",
      "Assignment Proposal constraints must be null or a non-empty string.",
    );
  }
  if (typeof command.reason !== "string" || command.reason.trim().length === 0) {
    return invalid(
      "ASSIGNMENT_PROPOSAL_REASON_REQUIRED",
      "A non-empty editorial reason is required.",
    );
  }

  return {
    ok: true,
    proposal: {
      writerProfileId: command.writerProfileId,
      angle: command.angle.trim(),
      brief: command.brief.trim(),
      constraints: command.constraints === null ? null : command.constraints.trim(),
      reason: command.reason.trim(),
    },
  };
}
