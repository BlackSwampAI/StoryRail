import type {
  AssignmentValidationCode,
  CreateAssignmentCommand,
  CreateAssignmentResult,
} from "./assignment-types";

function invalid(code: AssignmentValidationCode, message: string): CreateAssignmentResult {
  return { ok: false, error: { code, message } };
}

export function createAssignment(command: CreateAssignmentCommand): CreateAssignmentResult {
  if (typeof command.angle !== "string" || command.angle.trim().length === 0) {
    return invalid("ASSIGNMENT_ANGLE_REQUIRED", "A non-empty editorial angle is required.");
  }
  if (typeof command.brief !== "string" || command.brief.trim().length === 0) {
    return invalid("ASSIGNMENT_BRIEF_REQUIRED", "A non-empty Assignment brief is required.");
  }
  if (
    command.constraints !== null &&
    (typeof command.constraints !== "string" || command.constraints.trim().length === 0)
  ) {
    return invalid(
      "ASSIGNMENT_CONSTRAINTS_INVALID",
      "Assignment constraints must be null or a non-empty string.",
    );
  }
  if (command.writerProfileId.trim().length === 0) {
    return invalid(
      "ASSIGNMENT_WRITER_PROFILE_REQUIRED",
      "A non-empty Writer Profile identity is required.",
    );
  }
  if (command.assignedBy.type === "agent" && command.assignedBy.role !== "assignment_editor") {
    return invalid(
      "ASSIGNMENT_ACTOR_NOT_ALLOWED",
      "Only an operator or Assignment Editor agent may create an Assignment.",
    );
  }
  if (new Set(command.sourceIds).size !== command.sourceIds.length) {
    return invalid(
      "ASSIGNMENT_SOURCE_DUPLICATE",
      "An Assignment evidence snapshot cannot contain duplicate Source identities.",
    );
  }

  return {
    ok: true,
    assignment: {
      id: command.id,
      storyId: command.storyId,
      writerProfileId: command.writerProfileId,
      sourceIds: [...command.sourceIds],
      angle: command.angle.trim(),
      brief: command.brief.trim(),
      constraints: command.constraints === null ? null : command.constraints.trim(),
      assignedBy: structuredClone(command.assignedBy),
      assignedAt: command.assignedAt,
    },
  };
}
