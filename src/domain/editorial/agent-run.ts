import { GROUNDING_REFUSAL_CODES, MODEL_FAILURE_CODES } from "./source-evidence-preparation-types";
import { AGENT_ROLES, STORY_STATES, type EditorialActor } from "./types";
import { createAssignmentProposal } from "./assignment-proposal";
import { createDirectorReview } from "./director-review";
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
  if (!(
    (candidate.role === "assignment_editor" && candidate.operation === "assignment_proposal") ||
    (candidate.role === "researcher" && candidate.operation === "source_research") ||
    (candidate.role === "writer" &&
      (candidate.operation === "article_draft" || candidate.operation === "article_revision")) ||
    (candidate.role === "editor_in_chief" && candidate.operation === "article_review")
  )) {
    return invalid(
      "AGENT_RUN_ROLE_OPERATION_INVALID",
      "The AgentRun role and operation combination is unsupported.",
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
    input.evidence.some(({ sourceId }) => input.unavailableSourceIds.includes(sourceId))
  ) {
    return invalid("AGENT_RUN_EVIDENCE_DUPLICATE", "AgentRun input identities must be unique.");
  }
  if (!nonEmpty(candidate.startedAt)) {
    return invalid("AGENT_RUN_OUTCOME_INVALID", "AgentRun timestamps must be non-empty.");
  }
  // A run that is still in flight has no completion yet; a finished one must record when.
  if (candidate.outcome === "running") {
    if (candidate.completedAt !== null) {
      return invalid("AGENT_RUN_OUTCOME_INVALID", "A running AgentRun cannot be completed.");
    }
  } else if (!nonEmpty(candidate.completedAt)) {
    return invalid("AGENT_RUN_OUTCOME_INVALID", "AgentRun timestamps must be non-empty.");
  }
  if (candidate.role === "writer") {
    if (
      candidate.outcome === "succeeded" &&
      candidate.corrected !== undefined &&
      (!Array.isArray(candidate.corrected) || candidate.corrected.length === 0)
    ) {
      return invalid(
        "AGENT_RUN_OUTCOME_INVALID",
        "A recorded correction must say which citations were corrected.",
      );
    }
    const assignment = candidate.input.assignment;
    if (
      assignment.storyId !== candidate.storyId ||
      assignment.writerProfileId !== candidate.profileId ||
      !nonEmpty(assignment.id) ||
      !nonEmpty(assignment.angle) ||
      !nonEmpty(assignment.brief) ||
      (assignment.constraints !== null && !nonEmpty(assignment.constraints)) ||
      assignment.sourceIds.length === 0 ||
      !assignment.sourceIds.every(nonEmpty) ||
      new Set(assignment.sourceIds).size !== assignment.sourceIds.length ||
      input.evidence.some(({ sourceId }) => !assignment.sourceIds.includes(sourceId)) ||
      input.unavailableSourceIds.some((sourceId) => !assignment.sourceIds.includes(sourceId)) ||
      input.evidence.length + input.unavailableSourceIds.length !== assignment.sourceIds.length
    ) {
      return invalid("AGENT_RUN_INPUT_INVALID", "Writer AgentRun Assignment input is invalid.");
    }
    if (candidate.operation === "article_draft" && input.story.state !== "assigned") {
      return invalid("AGENT_RUN_INPUT_INVALID", "Writer draft input Story state is invalid.");
    }
    if (candidate.operation === "article_revision") {
      const { article, revision, directorReview, reviewDecision } = candidate.input;
      const review = createDirectorReview(directorReview);
      if (
        input.story.state !== "changes_requested" ||
        input.story.revisionCycle < 1 ||
        article.assignmentId !== assignment.id ||
        !nonEmpty(article.id) ||
        revision.articleId !== article.id ||
        revision.revisionNumber !== input.story.revisionCycle ||
        revision.writerProfileId !== assignment.writerProfileId ||
        !nonEmpty(revision.id) ||
        !nonEmpty(revision.agentRunId) ||
        !nonEmpty(revision.headline) ||
        (revision.dek !== null && !nonEmpty(revision.dek)) ||
        !nonEmpty(revision.bodyMarkdown) ||
        !review.ok ||
        !nonEmpty(reviewDecision.id) ||
        reviewDecision.storyId !== candidate.storyId ||
        reviewDecision.articleId !== article.id ||
        reviewDecision.revisionId !== revision.id ||
        !nonEmpty(reviewDecision.directorRunId) ||
        reviewDecision.decision !== "request_changes" ||
        !nonEmpty(reviewDecision.reason) ||
        reviewDecision.decidedBy.type !== "operator" ||
        !nonEmpty(reviewDecision.decidedBy.operatorId) ||
        !nonEmpty(reviewDecision.decidedAt)
      ) {
        return invalid("AGENT_RUN_INPUT_INVALID", "Writer revision input is invalid.");
      }
    }
    if (candidate.outcome === "succeeded") {
      if (!nonEmpty(candidate.articleId) || !nonEmpty(candidate.revisionId)) {
        return invalid(
          "AGENT_RUN_OUTCOME_INVALID",
          "Successful Writer AgentRun references are invalid.",
        );
      }
      return { ok: true, run: structuredClone(candidate) };
    }
  } else if (candidate.role === "researcher") {
    if (candidate.outcome === "succeeded") {
      const { attached } = candidate;
      if (
        !Array.isArray(attached) ||
        !attached.every(
          (source) =>
            nonEmpty(source.sourceId) && nonEmpty(source.url) && nonEmpty(source.relevance),
        ) ||
        new Set(attached.map(({ sourceId }) => sourceId)).size !== attached.length
      ) {
        return invalid(
          "AGENT_RUN_OUTCOME_INVALID",
          "Researched Sources must be distinct and completely described.",
        );
      }
      return { ok: true, run: structuredClone(candidate) };
    }
  } else if (candidate.role === "assignment_editor") {
    const writerProfileIds = candidate.input.writerProfileIds;
    if (
      writerProfileIds.length === 0 ||
      !writerProfileIds.every(nonEmpty) ||
      new Set(writerProfileIds).size !== writerProfileIds.length
    ) {
      return invalid("AGENT_RUN_INPUT_INVALID", "Assignment Editor Writer identities are invalid.");
    }
    if (candidate.outcome !== "succeeded") {
      // The shared failed-outcome validation below preserves the same input rules.
    } else {
      const proposal = createAssignmentProposal(candidate.proposal);
      if (!proposal.ok || !writerProfileIds.includes(proposal.proposal.writerProfileId)) {
        return invalid("AGENT_RUN_OUTCOME_INVALID", "Successful AgentRun proposal is invalid.");
      }
      return {
        ok: true,
        run: structuredClone({ ...candidate, proposal: proposal.proposal }),
      };
    }
  } else {
    const { assignment, article, revision } = candidate.input;
    if (
      candidate.input.story.state !== "in_review" ||
      assignment.storyId !== candidate.storyId ||
      !nonEmpty(assignment.id) ||
      !nonEmpty(assignment.writerProfileId) ||
      assignment.sourceIds.length === 0 ||
      !assignment.sourceIds.every(nonEmpty) ||
      new Set(assignment.sourceIds).size !== assignment.sourceIds.length ||
      !nonEmpty(assignment.angle) ||
      !nonEmpty(assignment.brief) ||
      (assignment.constraints !== null && !nonEmpty(assignment.constraints)) ||
      article.assignmentId !== assignment.id ||
      !nonEmpty(article.id) ||
      revision.articleId !== article.id ||
      !Number.isInteger(revision.revisionNumber) ||
      revision.revisionNumber < 1 ||
      revision.revisionNumber > 3 ||
      revision.writerProfileId !== assignment.writerProfileId ||
      !nonEmpty(revision.id) ||
      !nonEmpty(revision.writerProfileId) ||
      !nonEmpty(revision.agentRunId) ||
      !nonEmpty(revision.headline) ||
      (revision.dek !== null && !nonEmpty(revision.dek)) ||
      !nonEmpty(revision.bodyMarkdown) ||
      input.evidence.some(({ sourceId }) => !assignment.sourceIds.includes(sourceId)) ||
      input.unavailableSourceIds.some((sourceId) => !assignment.sourceIds.includes(sourceId)) ||
      input.evidence.length + input.unavailableSourceIds.length !== assignment.sourceIds.length
    ) {
      return invalid("AGENT_RUN_INPUT_INVALID", "Director AgentRun review input is invalid.");
    }
    if (candidate.outcome === "succeeded") {
      const review = createDirectorReview(candidate.review);
      if (!review.ok)
        return invalid("AGENT_RUN_OUTCOME_INVALID", "Successful Director review is invalid.");
      return { ok: true, run: structuredClone({ ...candidate, review: review.review }) };
    }
  }
  // Every role validates its input above; an in-flight run carries no outcome payload yet.
  if (candidate.outcome === "running") {
    return { ok: true, run: structuredClone(candidate) };
  }
  if (
    candidate.outcome !== "failed" ||
    !(MODEL_FAILURE_CODES as readonly string[]).includes(candidate.failure.code) ||
    typeof candidate.failure.retryable !== "boolean" ||
    // Findings explain a grounding refusal and mean nothing attached to any other failure.
    // MODEL_CORRECTION_OUT_OF_SCOPE is one: the draft is refused for its original citations, and
    // the code only names the correction as the reason it could not be rescued. Without the
    // findings an operator is told a correction went out of scope and never what it was asked to
    // fix, which is the half that says why the work was refused.
    (candidate.failure.findings !== undefined &&
      (!(GROUNDING_REFUSAL_CODES as readonly string[]).includes(candidate.failure.code) ||
        !Array.isArray(candidate.failure.findings) ||
        candidate.failure.findings.length === 0)) ||
    (candidate.failure.unsupportedChecks !== undefined &&
      (candidate.failure.code !== "MODEL_OUTPUT_UNGROUNDED" ||
        !Array.isArray(candidate.failure.unsupportedChecks) ||
        candidate.failure.unsupportedChecks.length === 0 ||
        !candidate.failure.unsupportedChecks.every(
          (name) => typeof name === "string" && name.trim().length > 0,
        )))
  ) {
    return invalid("AGENT_RUN_OUTCOME_INVALID", "Failed AgentRun outcome is invalid.");
  }
  return { ok: true, run: structuredClone(candidate) };
}
