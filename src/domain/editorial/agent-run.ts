import { MODEL_FAILURE_CODES } from "./source-evidence-preparation-types";
import { AGENT_ROLES, STORY_STATES, type EditorialActor } from "./types";
import { createAssignmentProposal } from "./assignment-proposal";
import type {
  AgentRun,
  AgentRunValidationCode,
  EvidenceReference,
  RecordAgentRunResult,
} from "./agent-run-types";

function invalid(code: AgentRunValidationCode, message: string): RecordAgentRunResult {
  return { ok: false, error: { code, message } };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function validReference(reference: EvidenceReference): boolean {
  return (
    nonEmpty(reference.sourceId) &&
    nonEmpty(reference.relevance) &&
    (reference.evidenceKind === "prepared" || reference.evidenceKind === "raw") &&
    nonEmpty(reference.evidenceId)
  );
}

function validActor(actor: EditorialActor): boolean {
  return actor.type === "operator"
    ? nonEmpty(actor.operatorId)
    : actor.type === "agent" &&
        (AGENT_ROLES as readonly string[]).includes(actor.role) &&
        nonEmpty(actor.runId);
}

export function recordAgentRun(candidate: AgentRun): RecordAgentRunResult {
  if (!nonEmpty(candidate.id) || !nonEmpty(candidate.storyId) || !nonEmpty(candidate.profileId)) {
    return invalid("AGENT_RUN_IDENTITY_INVALID", "AgentRun identities must be non-empty.");
  }
  if (candidate.role !== "assignment_editor" || candidate.operation !== "assignment_proposal") {
    return invalid(
      "AGENT_RUN_ROLE_OPERATION_INVALID",
      "Only Assignment Editor assignment_proposal runs are supported.",
    );
  }
  if (!nonEmpty(candidate.model.provider) || !nonEmpty(candidate.model.model)) {
    return invalid("AGENT_RUN_MODEL_INVALID", "AgentRun model descriptors must be non-empty.");
  }
  if (!nonEmpty(candidate.prompt.key) || !nonEmpty(candidate.prompt.version)) {
    return invalid("AGENT_RUN_PROMPT_INVALID", "AgentRun prompt descriptors must be non-empty.");
  }
  const input = candidate.input;
  if (
    input.story.id !== candidate.storyId ||
    !nonEmpty(input.story.title) ||
    !(STORY_STATES as readonly string[]).includes(input.story.state) ||
    !Number.isInteger(input.story.revisionCycle) ||
    input.story.revisionCycle < 0 ||
    input.story.revisionCycle > 2 ||
    input.evidence.length === 0 ||
    !input.evidence.every(validReference) ||
    !input.unavailableSourceIds.every(nonEmpty) ||
    input.writerProfileIds.length === 0 ||
    !input.writerProfileIds.every(nonEmpty) ||
    !validActor(candidate.requestedBy)
  ) {
    return invalid("AGENT_RUN_INPUT_INVALID", "AgentRun input snapshot is invalid.");
  }
  const evidenceKeys = input.evidence.map(
    ({ sourceId, evidenceKind, evidenceId }) =>
      `${sourceId}\u0000${evidenceKind}\u0000${evidenceId}`,
  );
  if (
    new Set(evidenceKeys).size !== evidenceKeys.length ||
    new Set(input.evidence.map(({ sourceId }) => sourceId)).size !== input.evidence.length ||
    new Set(input.unavailableSourceIds).size !== input.unavailableSourceIds.length ||
    new Set(input.writerProfileIds).size !== input.writerProfileIds.length ||
    input.evidence.some(({ sourceId }) => input.unavailableSourceIds.includes(sourceId))
  ) {
    return invalid("AGENT_RUN_EVIDENCE_DUPLICATE", "AgentRun input identities must be unique.");
  }
  if (!nonEmpty(candidate.startedAt) || !nonEmpty(candidate.completedAt)) {
    return invalid("AGENT_RUN_OUTCOME_INVALID", "AgentRun timestamps must be non-empty.");
  }
  if (candidate.outcome === "succeeded") {
    const proposal = createAssignmentProposal(candidate.proposal);
    if (!proposal.ok || !input.writerProfileIds.includes(proposal.proposal.writerProfileId)) {
      return invalid("AGENT_RUN_OUTCOME_INVALID", "Successful AgentRun proposal is invalid.");
    }
    return {
      ok: true,
      run: structuredClone({ ...candidate, proposal: proposal.proposal }),
    };
  }
  if (
    candidate.outcome !== "failed" ||
    !(MODEL_FAILURE_CODES as readonly string[]).includes(candidate.failure.code) ||
    typeof candidate.failure.retryable !== "boolean"
  ) {
    return invalid("AGENT_RUN_OUTCOME_INVALID", "Failed AgentRun outcome is invalid.");
  }
  return { ok: true, run: structuredClone(candidate) };
}
