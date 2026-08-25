import {
  ARTICLE_BLOCK_KINDS,
  DIRECTOR_CHECK_NAMES,
  SOURCE_EXTRACTION_FAILURE_CODES,
  PREPARATION_FAILURE_CODES,
  GROUNDING_REFUSAL_CODES,
  MODEL_FAILURE_CODES,
  type EditorialActor,
  type AgentProfile,
  type Assignment,
  type AgentRun,
  type Article,
  type ArticleBlock,
  type ArticleRevision,
  type ReviewDecision,
  type SourceExtraction,
  type SourceEvidencePreparation,
  type Story,
  type StoryTransitionReceipt,
  type StorySourceAttachment,
  type SiteId,
  type UrlSource,
} from "@/domain/editorial";
import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";

import { siteApiPath } from "./site-paths";

export const STORY_REQUEST_UNAVAILABLE_MESSAGE = "The Story request could not be completed.";

export interface StoryClientDependencies {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** Injectable so following a started run is deterministic under test. */
  readonly now?: () => number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}

export interface StoryClientApplicationError {
  readonly code: string;
  readonly message: string;
}

export type StoryClientResult<Value> =
  | { readonly kind: "completed"; readonly value: Value }
  | { readonly kind: "application-failure"; readonly error: StoryClientApplicationError }
  | { readonly kind: "unavailable"; readonly message: typeof STORY_REQUEST_UNAVAILABLE_MESSAGE };

export interface StoryClient {
  readonly listStories: () => Promise<StoryClientResult<readonly StoryListItem[]>>;
  readonly createStory: (title: string) => Promise<StoryClientResult<Story>>;
  readonly attachSource: (
    storyId: string,
    sourceId: string,
    relevance: string,
  ) => Promise<StoryClientResult<StorySourceAttachment>>;
  readonly inspectStory: (storyId: string) => Promise<StoryClientResult<StoryInspection>>;
  readonly assignStory: (
    storyId: string,
    command: {
      readonly writerProfileId: string;
      readonly angle: string;
      readonly brief: string;
      readonly constraints: string | null;
      readonly reason: string;
    },
  ) => Promise<
    StoryClientResult<{
      readonly assignment: Assignment;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }>
  >;
  readonly generateAssignmentProposal: (storyId: string) => Promise<StoryClientResult<AgentRun>>;
  /**
   * Autopilot spans several runs, so the client only accepts the start. Progress is followed by
   * inspecting the Story, which is the durable record of where the run has reached.
   */
  readonly startAutopilot: (
    storyId: string,
    options?: { readonly research?: boolean },
  ) => Promise<StoryClientResult<{ readonly runId: string }>>;
  /**
   * Retrieval takes as long as the pages do, so the client accepts the start and follows the
   * Story rather than holding the request open.
   */
  readonly startSourceResearch: (
    storyId: string,
  ) => Promise<StoryClientResult<{ readonly runId: string }>>;
  readonly createWriterDraft: (storyId: string) => Promise<StoryClientResult<AgentRun>>;
  readonly createWriterRevision: (storyId: string) => Promise<StoryClientResult<AgentRun>>;
  readonly rejectStory: (
    storyId: string,
    reason: string,
  ) => Promise<
    StoryClientResult<{ readonly story: Story; readonly transitionReceipt: StoryTransitionReceipt }>
  >;
  readonly publishStory: (
    storyId: string,
    reason: string,
  ) => Promise<
    StoryClientResult<{ readonly story: Story; readonly transitionReceipt: StoryTransitionReceipt }>
  >;
  readonly submitReview: (
    storyId: string,
  ) => Promise<
    StoryClientResult<{ readonly story: Story; readonly transitionReceipt: StoryTransitionReceipt }>
  >;
  readonly runDirectorReview: (storyId: string) => Promise<StoryClientResult<AgentRun>>;
  readonly recordReviewDecision: (
    storyId: string,
    command: {
      readonly directorRunId: string;
      readonly decision: "approve" | "request_changes";
      readonly reason: string;
    },
  ) => Promise<
    StoryClientResult<{
      readonly decision: ReviewDecision;
      readonly story: Story;
      readonly transitionReceipt: StoryTransitionReceipt;
    }>
  >;
}

const STORY_STATES = new Set([
  "intake",
  "assigned",
  "in_progress",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "published",
]);
const AGENT_ROLES = new Set(["assignment_editor", "writer", "fact_checker", "editor_in_chief"]);
const EXTRACTION_FAILURE_CODES = new Set<string>(SOURCE_EXTRACTION_FAILURE_CODES);
const PREPARATION_FAILURE_CODE_SET = new Set<string>(PREPARATION_FAILURE_CODES);
const GROUNDING_FAILURE_CODES: ReadonlySet<string> = new Set([
  "CITATION_EVIDENCE_UNKNOWN",
  "CITATION_SOURCE_MISMATCH",
  "CITATION_QUOTE_UNSUPPORTED",
]);
const MODEL_FAILURE_CODE_SET = new Set<string>(MODEL_FAILURE_CODES);
// Which failures may carry findings is the domain's rule, imported rather than restated. Written
// out here as a literal, it drifted from the domain and made a correctly recorded run unreadable.
const GROUNDING_REFUSAL_CODE_SET = new Set<string>(GROUNDING_REFUSAL_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value) || !isString(value.type)) return false;
  return value.type === "operator"
    ? hasExactKeys(value, ["type", "operatorId"]) && isString(value.operatorId)
    : value.type === "agent" &&
        hasExactKeys(value, ["type", "role", "runId"]) &&
        isString(value.role) &&
        AGENT_ROLES.has(value.role) &&
        isString(value.runId);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || isString(value);
}

/**
 * Findings explain a grounding refusal and belong to those codes alone, so a failure carrying
 * them under any other code is refused rather than shown.
 */
function isModelFailure(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isString(value.code) ||
    !MODEL_FAILURE_CODE_SET.has(value.code) ||
    typeof value.retryable !== "boolean"
  )
    return false;
  if (hasExactKeys(value, ["code", "retryable"])) return true;
  if (hasExactKeys(value, ["code", "retryable", "unsupportedChecks"]))
    return (
      value.code === "MODEL_OUTPUT_UNGROUNDED" &&
      Array.isArray(value.unsupportedChecks) &&
      value.unsupportedChecks.length > 0 &&
      value.unsupportedChecks.every((name) => isString(name) && name.trim().length > 0)
    );
  return (
    hasExactKeys(value, ["code", "retryable", "findings"]) &&
    GROUNDING_REFUSAL_CODE_SET.has(value.code) &&
    Array.isArray(value.findings) &&
    value.findings.length > 0 &&
    value.findings.every(
      (finding) =>
        isRecord(finding) &&
        hasExactKeys(finding, ["blockIndex", "citationIndex", "code", "quote", "evidenceId"]) &&
        Number.isInteger(finding.blockIndex) &&
        (finding.blockIndex as number) >= 0 &&
        Number.isInteger(finding.citationIndex) &&
        (finding.citationIndex as number) >= 0 &&
        isString(finding.code) &&
        GROUNDING_FAILURE_CODES.has(finding.code) &&
        isString(finding.quote) &&
        finding.quote.trim().length > 0 &&
        isString(finding.evidenceId) &&
        finding.evidenceId.trim().length > 0,
    )
  );
}

function isExtraction(value: unknown): value is SourceExtraction {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.sourceId) ||
    !isRecord(value.extractor) ||
    !hasExactKeys(value.extractor, ["key", "version"]) ||
    !isString(value.extractor.key) ||
    !isString(value.extractor.version) ||
    !isActor(value.requestedBy) ||
    !isString(value.startedAt) ||
    !isString(value.completedAt)
  ) {
    return false;
  }

  const commonKeys = [
    "id",
    "sourceId",
    "extractor",
    "requestedBy",
    "startedAt",
    "completedAt",
    "outcome",
  ];
  if (value.outcome === "succeeded") {
    return (
      hasExactKeys(value, [...commonKeys, "document"]) &&
      isRecord(value.document) &&
      hasExactKeys(value.document, [
        "format",
        "content",
        "title",
        "byline",
        "publishedAt",
        "language",
      ]) &&
      value.document.format === "markdown" &&
      isString(value.document.content) &&
      isStringOrNull(value.document.title) &&
      isStringOrNull(value.document.byline) &&
      isStringOrNull(value.document.publishedAt) &&
      isStringOrNull(value.document.language)
    );
  }

  return (
    value.outcome === "failed" &&
    hasExactKeys(value, [...commonKeys, "failure"]) &&
    isRecord(value.failure) &&
    hasExactKeys(value.failure, ["code", "retryable"]) &&
    isString(value.failure.code) &&
    EXTRACTION_FAILURE_CODES.has(value.failure.code) &&
    typeof value.failure.retryable === "boolean"
  );
}

function isPreparationInput(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["rawCharacters", "submittedCharacters"]) &&
    Number.isInteger(value.rawCharacters) &&
    Number.isInteger(value.submittedCharacters) &&
    (value.rawCharacters as number) >= 0 &&
    (value.submittedCharacters as number) >= 0 &&
    (value.submittedCharacters as number) <= (value.rawCharacters as number)
  );
}

function isPreparation(value: unknown): value is SourceEvidencePreparation {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.sourceId) ||
    !isString(value.extractionId) ||
    !isRecord(value.model) ||
    !hasExactKeys(value.model, ["provider", "model"]) ||
    !isString(value.model.provider) ||
    !isString(value.model.model) ||
    !isRecord(value.preparer) ||
    !hasExactKeys(value.preparer, ["key", "version"]) ||
    !isString(value.preparer.key) ||
    !isString(value.preparer.version) ||
    !isActor(value.requestedBy) ||
    !isPreparationInput(value.input) ||
    !isString(value.startedAt) ||
    !isString(value.completedAt)
  )
    return false;
  const common = [
    "id",
    "sourceId",
    "extractionId",
    "model",
    "preparer",
    "requestedBy",
    "input",
    "startedAt",
    "completedAt",
    "outcome",
  ];
  if (value.outcome === "succeeded") {
    return (
      hasExactKeys(value, [...common, "document"]) &&
      isRecord(value.document) &&
      hasExactKeys(value.document, [
        "format",
        "content",
        "title",
        "byline",
        "publishedAt",
        "language",
      ]) &&
      value.document.format === "markdown" &&
      isString(value.document.content) &&
      value.document.content.trim().length > 0 &&
      isStringOrNull(value.document.title) &&
      isStringOrNull(value.document.byline) &&
      isStringOrNull(value.document.publishedAt) &&
      isStringOrNull(value.document.language)
    );
  }
  return (
    value.outcome === "failed" &&
    hasExactKeys(value, [...common, "failure"]) &&
    isRecord(value.failure) &&
    hasExactKeys(value.failure, ["code", "retryable"]) &&
    isString(value.failure.code) &&
    PREPARATION_FAILURE_CODE_SET.has(value.failure.code) &&
    typeof value.failure.retryable === "boolean"
  );
}

function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "title", "state", "revisionCycle", "createdAt", "updatedAt"]) &&
    isString(value.id) &&
    isString(value.title) &&
    value.title.trim().length > 0 &&
    value.title === value.title.trim() &&
    isString(value.state) &&
    STORY_STATES.has(value.state) &&
    typeof value.revisionCycle === "number" &&
    Number.isInteger(value.revisionCycle) &&
    value.revisionCycle >= 0 &&
    value.revisionCycle <= 2 &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  );
}

function isProfile(value: unknown): value is AgentProfile {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "role", "name", "instructions", "model", "builtIn"]) &&
    isString(value.id) &&
    isString(value.role) &&
    ["assignment_editor", "writer", "editor_in_chief"].includes(value.role) &&
    isString(value.name) &&
    value.name.trim().length > 0 &&
    value.name === value.name.trim() &&
    isString(value.instructions) &&
    value.instructions.trim().length > 0 &&
    value.instructions === value.instructions.trim() &&
    (value.model === null ||
      (isRecord(value.model) &&
        hasExactKeys(value.model, ["provider", "model"]) &&
        isString(value.model.provider) &&
        value.model.provider.trim().length > 0 &&
        value.model.provider === value.model.provider.trim() &&
        isString(value.model.model) &&
        value.model.model.trim().length > 0 &&
        value.model.model === value.model.model.trim())) &&
    typeof value.builtIn === "boolean" &&
    (value.builtIn || value.role === "writer")
  );
}

function isAssignment(value: unknown): value is Assignment {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "storyId",
      "writerProfileId",
      "sourceIds",
      "angle",
      "brief",
      "constraints",
      "assignedBy",
      "assignedAt",
    ]) &&
    isString(value.id) &&
    isString(value.storyId) &&
    isString(value.writerProfileId) &&
    Array.isArray(value.sourceIds) &&
    value.sourceIds.every(isString) &&
    new Set(value.sourceIds).size === value.sourceIds.length &&
    isString(value.angle) &&
    value.angle.trim().length > 0 &&
    value.angle === value.angle.trim() &&
    isString(value.brief) &&
    value.brief.trim().length > 0 &&
    value.brief === value.brief.trim() &&
    (value.constraints === null ||
      (isString(value.constraints) &&
        value.constraints.trim().length > 0 &&
        value.constraints === value.constraints.trim())) &&
    isActor(value.assignedBy) &&
    (value.assignedBy.type === "operator" || value.assignedBy.role === "assignment_editor") &&
    isString(value.assignedAt)
  );
}

function isTransition(value: unknown): value is StoryTransitionReceipt {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "transitionId",
      "storyId",
      "previousState",
      "nextState",
      "actor",
      "reason",
      "occurredAt",
      "revisionCycle",
    ]) &&
    isString(value.transitionId) &&
    isString(value.storyId) &&
    isString(value.previousState) &&
    STORY_STATES.has(value.previousState) &&
    isString(value.nextState) &&
    STORY_STATES.has(value.nextState) &&
    isActor(value.actor) &&
    isString(value.reason) &&
    value.reason.trim().length > 0 &&
    value.reason === value.reason.trim() &&
    isString(value.occurredAt) &&
    Number.isInteger(value.revisionCycle) &&
    (value.revisionCycle as number) >= 0
  );
}

/** A run still in flight has no completion timestamp; a finished one must record when. */
function hasRunTimestamps(value: Record<string, unknown>): boolean {
  if (!isString(value.startedAt) || value.startedAt.trim().length === 0) return false;
  if (value.outcome === "running") return value.completedAt === null;
  return (
    isString(value.completedAt) &&
    (value.completedAt.trim().length === 0) === false &&
    value.completedAt === value.completedAt.trim()
  );
}

function isAgentRun(value: unknown): value is AgentRun {
  if (isDirectorAgentRun(value)) return true;
  if (isWriterAgentRun(value)) return true;
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    value.id.trim().length === 0 ||
    value.id !== value.id.trim() ||
    !isString(value.storyId) ||
    value.storyId.trim().length === 0 ||
    value.storyId !== value.storyId.trim() ||
    !isString(value.profileId) ||
    value.profileId.trim().length === 0 ||
    value.profileId !== value.profileId.trim() ||
    value.role !== "assignment_editor" ||
    value.operation !== "assignment_proposal" ||
    !isRecord(value.model) ||
    !hasExactKeys(value.model, ["provider", "model"]) ||
    !isString(value.model.provider) ||
    value.model.provider.trim().length === 0 ||
    value.model.provider !== value.model.provider.trim() ||
    !isString(value.model.model) ||
    value.model.model.trim().length === 0 ||
    value.model.model !== value.model.model.trim() ||
    !isRecord(value.prompt) ||
    !hasExactKeys(value.prompt, ["key", "version"]) ||
    !isString(value.prompt.key) ||
    value.prompt.key.trim().length === 0 ||
    value.prompt.key !== value.prompt.key.trim() ||
    !isString(value.prompt.version) ||
    value.prompt.version.trim().length === 0 ||
    value.prompt.version !== value.prompt.version.trim() ||
    !isActor(value.requestedBy) ||
    (value.requestedBy.type === "operator"
      ? value.requestedBy.operatorId.trim().length === 0 ||
        value.requestedBy.operatorId !== value.requestedBy.operatorId.trim()
      : value.requestedBy.runId.trim().length === 0 ||
        value.requestedBy.runId !== value.requestedBy.runId.trim()) ||
    !hasRunTimestamps(value) ||
    !isRecord(value.input) ||
    !hasExactKeys(value.input, ["story", "evidence", "unavailableSourceIds", "writerProfileIds"]) ||
    !isRecord(value.input.story) ||
    !hasExactKeys(value.input.story, ["id", "title", "state", "revisionCycle"]) ||
    value.input.story.id !== value.storyId ||
    !isString(value.input.story.title) ||
    value.input.story.title.trim().length === 0 ||
    value.input.story.title !== value.input.story.title.trim() ||
    !isString(value.input.story.state) ||
    !STORY_STATES.has(value.input.story.state) ||
    !Number.isInteger(value.input.story.revisionCycle) ||
    !Array.isArray(value.input.evidence) ||
    value.input.evidence.length === 0 ||
    !Array.isArray(value.input.unavailableSourceIds) ||
    !value.input.unavailableSourceIds.every(
      (identity) =>
        isString(identity) && identity.trim().length > 0 && identity === identity.trim(),
    ) ||
    new Set(value.input.unavailableSourceIds).size !== value.input.unavailableSourceIds.length ||
    !Array.isArray(value.input.writerProfileIds) ||
    value.input.writerProfileIds.length === 0 ||
    !value.input.writerProfileIds.every(
      (identity) =>
        isString(identity) && identity.trim().length > 0 && identity === identity.trim(),
    ) ||
    new Set(value.input.writerProfileIds).size !== value.input.writerProfileIds.length
  )
    return false;
  const sourceIds = new Set<string>();
  for (const reference of value.input.evidence) {
    if (
      !isRecord(reference) ||
      !hasExactKeys(reference, ["sourceId", "relevance", "evidenceKind", "evidenceId"]) ||
      !isString(reference.sourceId) ||
      reference.sourceId.trim().length === 0 ||
      reference.sourceId !== reference.sourceId.trim() ||
      sourceIds.has(reference.sourceId) ||
      value.input.unavailableSourceIds.includes(reference.sourceId) ||
      !isString(reference.relevance) ||
      reference.relevance.trim().length === 0 ||
      reference.relevance !== reference.relevance.trim() ||
      (reference.evidenceKind !== "prepared" && reference.evidenceKind !== "raw") ||
      !isString(reference.evidenceId) ||
      reference.evidenceId.trim().length === 0 ||
      reference.evidenceId !== reference.evidenceId.trim()
    )
      return false;
    sourceIds.add(reference.sourceId);
  }
  const common = [
    "id",
    "storyId",
    "profileId",
    "role",
    "operation",
    "model",
    "prompt",
    "requestedBy",
    "startedAt",
    "completedAt",
    "input",
    "outcome",
  ];
  if (value.outcome === "running") return hasExactKeys(value, common);
  if (value.outcome === "succeeded") {
    return (
      hasExactKeys(value, [...common, "proposal"]) &&
      isRecord(value.proposal) &&
      hasExactKeys(value.proposal, [
        "writerProfileId",
        "angle",
        "brief",
        "constraints",
        "reason",
      ]) &&
      isString(value.proposal.writerProfileId) &&
      value.proposal.writerProfileId.trim().length > 0 &&
      value.proposal.writerProfileId === value.proposal.writerProfileId.trim() &&
      value.input.writerProfileIds.includes(value.proposal.writerProfileId) &&
      isString(value.proposal.angle) &&
      value.proposal.angle.trim().length > 0 &&
      value.proposal.angle === value.proposal.angle.trim() &&
      isString(value.proposal.brief) &&
      value.proposal.brief.trim().length > 0 &&
      value.proposal.brief === value.proposal.brief.trim() &&
      (value.proposal.constraints === null ||
        (isString(value.proposal.constraints) &&
          value.proposal.constraints.trim().length > 0 &&
          value.proposal.constraints === value.proposal.constraints.trim())) &&
      isString(value.proposal.reason) &&
      value.proposal.reason.trim().length > 0 &&
      value.proposal.reason === value.proposal.reason.trim()
    );
  }
  return (
    value.outcome === "failed" &&
    hasExactKeys(value, [...common, "failure"]) &&
    isModelFailure(value.failure)
  );
}

function isReviewCheck(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["status", "note", "quoted"]) &&
    (value.status === "pass" || value.status === "needs_changes") &&
    isString(value.note) &&
    value.note.trim().length > 0 &&
    // A check that cannot point at the passage it judged is not a review of this Article.
    isString(value.quoted) &&
    value.quoted.trim().length > 0
  );
}

function isDirectorAgentRun(value: unknown): value is AgentRun {
  if (
    !isRecord(value) ||
    value.role !== "editor_in_chief" ||
    value.operation !== "article_review" ||
    !isString(value.id) ||
    !isString(value.storyId) ||
    !isString(value.profileId) ||
    !isRecord(value.model) ||
    !hasExactKeys(value.model, ["provider", "model"]) ||
    !isString(value.model.provider) ||
    !isString(value.model.model) ||
    !isRecord(value.prompt) ||
    !hasExactKeys(value.prompt, ["key", "version"]) ||
    !isString(value.prompt.key) ||
    !isString(value.prompt.version) ||
    !isActor(value.requestedBy) ||
    !hasRunTimestamps(value) ||
    !isRecord(value.input) ||
    !hasExactKeys(value.input, [
      "story",
      "assignment",
      "article",
      "revision",
      "evidence",
      "unavailableSourceIds",
    ]) ||
    !isRecord(value.input.story) ||
    value.input.story.id !== value.storyId ||
    !isRecord(value.input.assignment) ||
    value.input.assignment.storyId !== value.storyId ||
    !isRecord(value.input.article) ||
    !isString(value.input.article.id) ||
    !isRecord(value.input.revision) ||
    value.input.revision.articleId !== value.input.article.id ||
    !isString(value.input.revision.id) ||
    !Array.isArray(value.input.evidence) ||
    !Array.isArray(value.input.unavailableSourceIds)
  )
    return false;
  const common = [
    "id",
    "storyId",
    "profileId",
    "role",
    "operation",
    "model",
    "prompt",
    "requestedBy",
    "startedAt",
    "completedAt",
    "input",
    "outcome",
  ];
  if (value.outcome === "running") return hasExactKeys(value, common);
  if (value.outcome === "failed")
    return hasExactKeys(value, [...common, "failure"]) && isModelFailure(value.failure);
  if (
    value.outcome !== "succeeded" ||
    !hasExactKeys(value, [...common, "review"]) ||
    !isRecord(value.review)
  )
    return false;
  const review = value.review;
  const checks = review.checks;
  const shapeValid =
    hasExactKeys(review, ["recommendation", "summary", "checks", "revisionInstructions"]) &&
    (review.recommendation === "approve" || review.recommendation === "request_changes") &&
    isString(review.summary) &&
    review.summary.trim().length > 0 &&
    isRecord(checks) &&
    hasExactKeys(checks, [...DIRECTOR_CHECK_NAMES]) &&
    DIRECTOR_CHECK_NAMES.every((name) => isReviewCheck(checks[name])) &&
    (review.revisionInstructions === null ||
      (isString(review.revisionInstructions) && review.revisionInstructions.trim().length > 0));
  if (!shapeValid) return false;
  const validatedChecks = checks as Record<string, unknown>;
  const statuses = DIRECTOR_CHECK_NAMES.map(
    (name) => (validatedChecks[name] as Record<string, unknown>).status,
  );
  return review.recommendation === "approve"
    ? statuses.every((status) => status === "pass") && review.revisionInstructions === null
    : statuses.some((status) => status === "needs_changes") &&
        isString(review.revisionInstructions) &&
        review.revisionInstructions.trim().length > 0;
}

function isReviewDecision(value: unknown): value is ReviewDecision {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "storyId",
      "articleId",
      "revisionId",
      "directorRunId",
      "decision",
      "reason",
      "decidedBy",
      "decidedAt",
    ]) &&
    isString(value.id) &&
    isString(value.storyId) &&
    isString(value.articleId) &&
    isString(value.revisionId) &&
    isString(value.directorRunId) &&
    (value.decision === "approve" || value.decision === "request_changes") &&
    isString(value.reason) &&
    value.reason.trim().length > 0 &&
    isActor(value.decidedBy) &&
    value.decidedBy.type === "operator" &&
    isString(value.decidedAt)
  );
}

function isWriterAgentRun(value: unknown): value is AgentRun {
  if (
    !isRecord(value) ||
    value.role !== "writer" ||
    (value.operation !== "article_draft" && value.operation !== "article_revision") ||
    !isString(value.id) ||
    !isString(value.storyId) ||
    !isString(value.profileId) ||
    !isRecord(value.model) ||
    !hasExactKeys(value.model, ["provider", "model"]) ||
    !isString(value.model.provider) ||
    !isString(value.model.model) ||
    !isRecord(value.prompt) ||
    !hasExactKeys(value.prompt, ["key", "version"]) ||
    !isString(value.prompt.key) ||
    !isString(value.prompt.version) ||
    !isActor(value.requestedBy) ||
    !hasRunTimestamps(value) ||
    !isRecord(value.input) ||
    !(
      (value.operation === "article_draft" &&
        hasExactKeys(value.input, ["story", "assignment", "evidence", "unavailableSourceIds"])) ||
      (value.operation === "article_revision" &&
        hasExactKeys(value.input, [
          "story",
          "assignment",
          "article",
          "revision",
          "directorReview",
          "reviewDecision",
          "evidence",
          "unavailableSourceIds",
        ]))
    ) ||
    !isRecord(value.input.story) ||
    value.input.story.id !== value.storyId ||
    !isRecord(value.input.assignment) ||
    value.input.assignment.storyId !== value.storyId ||
    value.input.assignment.writerProfileId !== value.profileId ||
    !Array.isArray(value.input.evidence) ||
    value.input.evidence.length === 0 ||
    !Array.isArray(value.input.unavailableSourceIds)
  )
    return false;
  if (value.operation === "article_revision") {
    const { article, revision, directorReview, reviewDecision } = value.input;
    if (
      !isRecord(article) ||
      !hasExactKeys(article, ["id", "assignmentId"]) ||
      !isString(article.id) ||
      !isString(article.assignmentId) ||
      !isRecord(revision) ||
      !hasExactKeys(revision, [
        "id",
        "articleId",
        "revisionNumber",
        "writerProfileId",
        "agentRunId",
        "headline",
        "dek",
        "bodyMarkdown",
      ]) ||
      revision.articleId !== article.id ||
      !isString(revision.id) ||
      !Number.isInteger(revision.revisionNumber) ||
      (revision.revisionNumber as number) < 1 ||
      (revision.revisionNumber as number) > 2 ||
      !isString(revision.writerProfileId) ||
      !isString(revision.agentRunId) ||
      !isString(revision.headline) ||
      !isStringOrNull(revision.dek) ||
      !isString(revision.bodyMarkdown) ||
      !isRecord(directorReview) ||
      !hasExactKeys(directorReview, [
        "recommendation",
        "summary",
        "checks",
        "revisionInstructions",
      ]) ||
      (directorReview.recommendation !== "approve" &&
        directorReview.recommendation !== "request_changes") ||
      !isString(directorReview.summary) ||
      !isRecord(directorReview.checks) ||
      !hasExactKeys(directorReview.checks, [
        "assignment",
        "accuracy",
        "headline",
        "structure",
        "style",
      ]) ||
      ![...DIRECTOR_CHECK_NAMES].every((name) =>
        isReviewCheck((directorReview.checks as Record<string, unknown>)[name]),
      ) ||
      !(
        directorReview.revisionInstructions === null ||
        (isString(directorReview.revisionInstructions) &&
          directorReview.revisionInstructions.trim().length > 0)
      ) ||
      !isReviewDecision(reviewDecision) ||
      reviewDecision.storyId !== value.storyId ||
      reviewDecision.articleId !== article.id ||
      reviewDecision.revisionId !== revision.id ||
      reviewDecision.decision !== "request_changes"
    )
      return false;
  }
  const common = [
    "id",
    "storyId",
    "profileId",
    "role",
    "operation",
    "model",
    "prompt",
    "requestedBy",
    "startedAt",
    "completedAt",
    "input",
    "outcome",
  ];
  if (value.outcome === "running") return hasExactKeys(value, common);
  return value.outcome === "succeeded"
    ? (hasExactKeys(value, [...common, "articleId", "revisionId"]) ||
        (hasExactKeys(value, [...common, "articleId", "revisionId", "corrected"]) &&
          Array.isArray(value.corrected) &&
          value.corrected.length > 0)) &&
        isString(value.articleId) &&
        isString(value.revisionId)
    : value.outcome === "failed" &&
        hasExactKeys(value, [...common, "failure"]) &&
        isModelFailure(value.failure);
}

function isArticleBlock(value: unknown): value is ArticleBlock {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["kind", "markdown", "citations"]) &&
    (ARTICLE_BLOCK_KINDS as readonly string[]).includes(value.kind as string) &&
    isString(value.markdown) &&
    value.markdown.trim().length > 0 &&
    Array.isArray(value.citations) &&
    value.citations.every(
      (citation) =>
        isRecord(citation) &&
        hasExactKeys(citation, ["sourceId", "evidenceId", "quote"]) &&
        isString(citation.sourceId) &&
        isString(citation.evidenceId) &&
        isString(citation.quote) &&
        citation.quote.trim().length > 0,
    ) &&
    // A claim states something the evidence supports and must say where; anything else is the
    // Writer's own prose and must not carry attribution.
    (value.kind === "claim" ? value.citations.length > 0 : value.citations.length === 0)
  );
}

function isArticle(value: unknown): value is Article {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "storyId", "assignmentId", "createdAt"]) &&
    isString(value.id) &&
    isString(value.storyId) &&
    isString(value.assignmentId) &&
    isString(value.createdAt)
  );
}

function isArticleRevision(value: unknown): value is ArticleRevision {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "articleId",
      "revisionNumber",
      "writerProfileId",
      "agentRunId",
      "headline",
      "dek",
      "blocks",
      "createdBy",
      "createdAt",
    ]) &&
    isString(value.id) &&
    isString(value.articleId) &&
    Number.isInteger(value.revisionNumber) &&
    (value.revisionNumber as number) >= 1 &&
    (value.revisionNumber as number) <= 3 &&
    isString(value.writerProfileId) &&
    isString(value.agentRunId) &&
    isString(value.headline) &&
    value.headline.trim().length > 0 &&
    isStringOrNull(value.dek) &&
    Array.isArray(value.blocks) &&
    value.blocks.length > 0 &&
    value.blocks.every(isArticleBlock) &&
    isActor(value.createdBy) &&
    value.createdBy.type === "agent" &&
    value.createdBy.role === "writer" &&
    value.createdBy.runId === value.agentRunId &&
    isString(value.createdAt)
  );
}

function isInspectionArticle(value: unknown, story: Story): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !hasExactKeys(value, ["article", "revisions"])) return false;
  const article = value.article;
  const revisions = value.revisions;
  return (
    isArticle(article) &&
    article.storyId === story.id &&
    Array.isArray(revisions) &&
    revisions.length >= 1 &&
    revisions.length <= 3 &&
    revisions.every(
      (revision, index) =>
        isArticleRevision(revision) &&
        revision.articleId === article.id &&
        revision.revisionNumber === index + 1,
    )
  );
}

function isSource(value: unknown): value is UrlSource {
  return (
    isRecord(value) &&
    isString(value.id) &&
    value.type === "url" &&
    isString(value.submittedUrl) &&
    isString(value.canonicalUrl) &&
    isActor(value.submittedBy) &&
    isString(value.receivedAt)
  );
}

function isAttachment(value: unknown): value is StorySourceAttachment {
  return (
    isRecord(value) &&
    isString(value.storyId) &&
    isString(value.sourceId) &&
    isString(value.relevance) &&
    isActor(value.attachedBy) &&
    isString(value.attachedAt)
  );
}

function isInspection(value: unknown): value is StoryInspection {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "story",
      "sources",
      "assignment",
      "transitions",
      "agentRuns",
      "article",
      "reviewDecisions",
    ]) ||
    !isStory(value.story) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.transitions) ||
    !value.transitions.every(isTransition) ||
    !Array.isArray(value.agentRuns) ||
    !value.agentRuns.every(isAgentRun) ||
    !Array.isArray(value.reviewDecisions) ||
    !value.reviewDecisions.every(isReviewDecision)
  ) {
    return false;
  }
  const story = value.story;
  const articleValid = isInspectionArticle(value.article, story);
  const assignmentValid =
    value.assignment === null ||
    (isRecord(value.assignment) &&
      hasExactKeys(value.assignment, ["assignment", "writerProfile"]) &&
      isAssignment(value.assignment.assignment) &&
      isProfile(value.assignment.writerProfile) &&
      value.assignment.assignment.storyId === story.id &&
      value.assignment.assignment.writerProfileId === value.assignment.writerProfile.id &&
      value.assignment.writerProfile.role === "writer");
  return (
    assignmentValid &&
    articleValid &&
    value.transitions.every((receipt) => receipt.storyId === story.id) &&
    value.agentRuns.every((run) => run.storyId === story.id) &&
    value.reviewDecisions.every((decision) => decision.storyId === story.id) &&
    value.sources.every((item) => {
      if (
        !isRecord(item) ||
        !hasExactKeys(item, ["attachment", "source", "extractions", "preparations"]) ||
        !isAttachment(item.attachment) ||
        !isSource(item.source) ||
        !Array.isArray(item.extractions) ||
        !item.extractions.every(isExtraction) ||
        !Array.isArray(item.preparations) ||
        !item.preparations.every(isPreparation)
      ) {
        return false;
      }
      const sourceId = item.source.id;
      const extractionIds = new Set(item.extractions.map((extraction) => extraction.id));
      return (
        item.attachment.storyId === story.id &&
        item.attachment.sourceId === sourceId &&
        item.extractions.every((extraction) => extraction.sourceId === sourceId) &&
        item.preparations.every(
          (preparation) =>
            preparation.sourceId === sourceId && extractionIds.has(preparation.extractionId),
        )
      );
    })
  );
}

function isStoryListItem(value: unknown): value is StoryListItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["story", "sourceCount"]) &&
    isRecord(value.story) &&
    hasExactKeys(value.story, [
      "id",
      "title",
      "state",
      "revisionCycle",
      "createdAt",
      "updatedAt",
    ]) &&
    isStory(value.story) &&
    typeof value.sourceCount === "number" &&
    Number.isSafeInteger(value.sourceCount) &&
    value.sourceCount >= 0
  );
}

function isStoryList(value: unknown): value is readonly StoryListItem[] {
  return Array.isArray(value) && value.every(isStoryListItem);
}

function isApplicationError(value: unknown): value is StoryClientApplicationError {
  return isRecord(value) && isString(value.code) && isString(value.message);
}

function unavailable(): StoryClientResult<never> {
  return { kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE };
}

const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };

/** How often a started agent run is checked, and how long the client keeps following it. */
const RUN_POLL_INTERVAL_MS = 1_000;
const RUN_POLL_TIMEOUT_MS = 5 * 60_000;

function isStartedRun(value: unknown): value is { readonly runId: string } {
  return isRecord(value) && typeof value.runId === "string" && value.runId.trim().length > 0;
}

/**
 * Accepts a started run without following it. Autopilot's sequence outlives any single run, so
 * the caller watches the Story instead of one run identity.
 */
async function acceptRun(
  dependencies: Required<StoryClientDependencies>,
  input: string,
  applicationErrors: Readonly<Record<number, ReadonlySet<string>>>,
  request: Readonly<Record<string, unknown>> = {},
): Promise<StoryClientResult<{ readonly runId: string }>> {
  try {
    const response = await dependencies.fetch(input, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(request),
    });
    const body: unknown = await response.json();
    if (!isRecord(body)) return unavailable();
    if (response.status === 202 && body.ok === true && isStartedRun(body))
      return { kind: "completed", value: { runId: body.runId } };
    if (
      response.status >= 400 &&
      response.status < 500 &&
      body.ok === false &&
      isApplicationError(body.error) &&
      applicationErrors[response.status]?.has(body.error.code) === true
    )
      return { kind: "application-failure", error: body.error };
    return unavailable();
  } catch {
    return unavailable();
  }
}

/**
 * Supervised agent endpoints accept the request and answer with the identity of a run that is
 * already durable, rather than holding the connection open for the model. The client follows
 * that run by inspecting the Story until it reaches a terminal outcome, so callers keep the
 * same contract they had when the request blocked.
 */
async function startRun(
  dependencies: Required<StoryClientDependencies>,
  storyId: string,
  input: string,
  applicationErrors: Readonly<Record<number, ReadonlySet<string>>>,
  inspect: (storyId: string) => Promise<StoryClientResult<StoryInspection>>,
): Promise<StoryClientResult<AgentRun>> {
  let runId: string;
  try {
    const response = await dependencies.fetch(input, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    });
    const body: unknown = await response.json();
    if (!isRecord(body)) return unavailable();
    if (response.status === 202 && body.ok === true && isStartedRun(body)) {
      runId = body.runId;
    } else if (
      response.status >= 400 &&
      response.status < 500 &&
      body.ok === false &&
      isApplicationError(body.error) &&
      applicationErrors[response.status]?.has(body.error.code) === true
    ) {
      return { kind: "application-failure", error: body.error };
    } else {
      return unavailable();
    }
  } catch {
    return unavailable();
  }

  const deadline = dependencies.now() + RUN_POLL_TIMEOUT_MS;
  for (;;) {
    const inspected = await inspect(storyId);
    if (inspected.kind !== "completed") return inspected;
    const run = inspected.value.agentRuns.find((candidate) => candidate.id === runId);
    if (run && run.outcome !== "running") return { kind: "completed", value: run };
    if (dependencies.now() >= deadline) return unavailable();
    await dependencies.wait(RUN_POLL_INTERVAL_MS);
  }
}

async function request<Value>(
  fetch: StoryClientDependencies["fetch"],
  input: string,
  init: RequestInit,
  successStatus: number,
  successKey: "story" | "stories" | "attachment" | "inspection" | "run",
  validate: (value: unknown) => value is Value,
  applicationErrors: Readonly<Record<number, ReadonlySet<string>>>,
): Promise<StoryClientResult<Value>> {
  try {
    const response = await fetch(input, init);
    const body: unknown = await response.json();
    if (!isRecord(body)) return unavailable();
    const value = body[successKey];
    if (response.status === successStatus && body.ok === true && validate(value)) {
      return { kind: "completed", value };
    }
    if (
      response.status >= 400 &&
      response.status < 500 &&
      body.ok === false &&
      isApplicationError(body.error) &&
      applicationErrors[response.status]?.has(body.error.code) === true
    ) {
      return { kind: "application-failure", error: body.error };
    }
    return unavailable();
  } catch {
    return unavailable();
  }
}

export function createStoryClient(dependencies: StoryClientDependencies): StoryClient {
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  const resolved: Required<StoryClientDependencies> = {
    siteId: dependencies.siteId,
    fetch: dependencies.fetch,
    now: dependencies.now ?? (() => Date.now()),
    wait:
      dependencies.wait ??
      ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))),
  };
  const client: StoryClient = {
    listStories: () =>
      request(
        dependencies.fetch,
        api("/stories"),
        { method: "GET", headers: { Accept: "application/json" } },
        200,
        "stories",
        isStoryList,
        {},
      ),
    createStory: (title) =>
      request(
        dependencies.fetch,
        api("/stories"),
        { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title }) },
        201,
        "story",
        isStory,
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          409: new Set(["STORY_ID_CONFLICT"]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["STORY_TITLE_REQUIRED"]),
        },
      ),
    attachSource: (storyId, sourceId, relevance) =>
      request(
        dependencies.fetch,
        api(`/stories/${encodeURIComponent(storyId)}/sources`),
        {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({ sourceId, relevance }),
        },
        200,
        "attachment",
        isAttachment,
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND", "SOURCE_NOT_FOUND"]),
          409: new Set(["STORY_SOURCE_CONFLICT"]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["STORY_SOURCE_RELEVANCE_REQUIRED"]),
        },
      ),
    inspectStory: (storyId) =>
      request(
        dependencies.fetch,
        api(`/stories/${encodeURIComponent(storyId)}`),
        { method: "GET", headers: { Accept: "application/json" } },
        200,
        "inspection",
        isInspection,
        { 404: new Set(["STORY_NOT_FOUND"]) },
      ),
    async assignStory(storyId, command) {
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/assignments`),
          { method: "POST", headers: jsonHeaders, body: JSON.stringify(command) },
        );
        const body: unknown = await response.json();
        if (!isRecord(body)) return unavailable();
        if (
          response.status === 201 &&
          body.ok === true &&
          hasExactKeys(body, ["ok", "assignment", "story", "transitionReceipt"]) &&
          isAssignment(body.assignment) &&
          isStory(body.story) &&
          isTransition(body.transitionReceipt) &&
          body.assignment.storyId === body.story.id &&
          body.transitionReceipt.storyId === body.story.id &&
          body.story.state === "assigned"
        ) {
          return {
            kind: "completed",
            value: {
              assignment: body.assignment,
              story: body.story,
              transitionReceipt: body.transitionReceipt,
            },
          };
        }
        if (
          response.status >= 400 &&
          response.status < 500 &&
          body.ok === false &&
          isApplicationError(body.error) &&
          new Set([
            "INVALID_JSON",
            "INVALID_REQUEST",
            "UNSUPPORTED_MEDIA_TYPE",
            "STORY_NOT_FOUND",
            "AGENT_PROFILE_NOT_FOUND",
            "AGENT_PROFILE_NOT_WRITER",
            "INVALID_TRANSITION",
            "STORY_ASSIGNMENT_CONFLICT",
            "REASON_REQUIRED",
            "ASSIGNMENT_ANGLE_REQUIRED",
            "ASSIGNMENT_BRIEF_REQUIRED",
            "ASSIGNMENT_CONSTRAINTS_INVALID",
            "ASSIGNMENT_WRITER_PROFILE_REQUIRED",
            "ASSIGNMENT_ACTOR_NOT_ALLOWED",
            "ASSIGNMENT_SOURCE_DUPLICATE",
          ]).has(body.error.code)
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    startSourceResearch: (storyId) =>
      acceptRun(resolved, api(`/stories/${encodeURIComponent(storyId)}/research`), {
        400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
        404: new Set(["STORY_NOT_FOUND"]),
        409: new Set(["SOURCE_RESEARCH_NOT_ALLOWED", "AGENT_RUN_ID_CONFLICT"]),
        415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
        422: new Set(["RESEARCH_EVIDENCE_REQUIRED"]),
      }),
    startAutopilot: (storyId, options) =>
      acceptRun(
        resolved,
        api(`/stories/${encodeURIComponent(storyId)}/autopilot`),
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND"]),
          409: new Set(["ASSIGNMENT_PROPOSAL_NOT_ALLOWED", "AGENT_RUN_ID_CONFLICT"]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED", "WRITER_PROFILE_REQUIRED"]),
        },
        options?.research === true ? { research: true } : {},
      ),
    generateAssignmentProposal: (storyId) =>
      startRun(
        resolved,
        storyId,
        api(`/stories/${encodeURIComponent(storyId)}/assignment-proposals`),
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND"]),
          409: new Set(["ASSIGNMENT_PROPOSAL_NOT_ALLOWED", "AGENT_RUN_ID_CONFLICT"]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED", "WRITER_PROFILE_REQUIRED"]),
        },
        (identity) => client.inspectStory(identity),
      ),
    createWriterDraft: (storyId) =>
      startRun(
        resolved,
        storyId,
        api(`/stories/${encodeURIComponent(storyId)}/writer-drafts`),
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND"]),
          409: new Set([
            "WRITER_DRAFT_NOT_ALLOWED",
            "ASSIGNMENT_REQUIRED",
            "ARTICLE_ALREADY_EXISTS",
            "WRITER_DRAFT_CONFLICT",
            "AGENT_RUN_ID_CONFLICT",
          ]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["WRITER_EVIDENCE_REQUIRED"]),
        },
        (identity) => client.inspectStory(identity),
      ),
    createWriterRevision: (storyId) =>
      startRun(
        resolved,
        storyId,
        api(`/stories/${encodeURIComponent(storyId)}/writer-revisions`),
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND"]),
          409: new Set([
            "WRITER_REVISION_NOT_ALLOWED",
            "ASSIGNMENT_REQUIRED",
            "ARTICLE_REQUIRED",
            "ARTICLE_REVISION_REQUIRED",
            "REVIEW_DECISION_REQUIRED",
            "REVIEW_CONTEXT_MISMATCH",
            "WRITER_REVISION_CONFLICT",
            "AGENT_RUN_ID_CONFLICT",
          ]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set(["WRITER_EVIDENCE_UNAVAILABLE"]),
        },
        (identity) => client.inspectStory(identity),
      ),
    async rejectStory(storyId, reason) {
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/rejections`),
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ reason }),
          },
        );
        const body: unknown = await response.json();
        if (
          isRecord(body) &&
          response.status === 201 &&
          body.ok === true &&
          hasExactKeys(body, ["ok", "story", "transitionReceipt"]) &&
          isStory(body.story) &&
          isTransition(body.transitionReceipt)
        )
          return {
            kind: "completed",
            value: { story: body.story, transitionReceipt: body.transitionReceipt },
          };
        if (
          isRecord(body) &&
          body.ok === false &&
          isApplicationError(body.error) &&
          response.status >= 400 &&
          response.status < 500
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    async publishStory(storyId, reason) {
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/publications`),
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ reason }),
          },
        );
        const body: unknown = await response.json();
        if (
          isRecord(body) &&
          response.status === 201 &&
          body.ok === true &&
          hasExactKeys(body, ["ok", "story", "transitionReceipt"]) &&
          isStory(body.story) &&
          isTransition(body.transitionReceipt)
        )
          return {
            kind: "completed",
            value: { story: body.story, transitionReceipt: body.transitionReceipt },
          };
        if (
          isRecord(body) &&
          body.ok === false &&
          isApplicationError(body.error) &&
          response.status >= 400 &&
          response.status < 500
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    async submitReview(storyId) {
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/review-submissions`),
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({}),
          },
        );
        const body: unknown = await response.json();
        if (
          isRecord(body) &&
          response.status === 201 &&
          body.ok === true &&
          hasExactKeys(body, ["ok", "story", "transitionReceipt"]) &&
          isStory(body.story) &&
          isTransition(body.transitionReceipt)
        )
          return {
            kind: "completed",
            value: { story: body.story, transitionReceipt: body.transitionReceipt },
          };
        if (
          isRecord(body) &&
          body.ok === false &&
          isApplicationError(body.error) &&
          response.status >= 400 &&
          response.status < 500
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    runDirectorReview: (storyId) =>
      startRun(
        resolved,
        storyId,
        api(`/stories/${encodeURIComponent(storyId)}/director-reviews`),
        {
          400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
          404: new Set(["STORY_NOT_FOUND"]),
          409: new Set([
            "DIRECTOR_REVIEW_NOT_ALLOWED",
            "DIRECTOR_REVIEW_ALREADY_SUCCEEDED",
            "AGENT_RUN_ID_CONFLICT",
          ]),
          415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
          422: new Set([
            "ASSIGNMENT_REQUIRED",
            "ARTICLE_REQUIRED",
            "ARTICLE_REVISION_REQUIRED",
            "DIRECTOR_EVIDENCE_UNAVAILABLE",
          ]),
        },
        (identity) => client.inspectStory(identity),
      ),
    async recordReviewDecision(storyId, command) {
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/review-decisions`),
          {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify(command),
          },
        );
        const body: unknown = await response.json();
        if (
          isRecord(body) &&
          response.status === 201 &&
          body.ok === true &&
          hasExactKeys(body, ["ok", "decision", "story", "transitionReceipt"]) &&
          isReviewDecision(body.decision) &&
          isStory(body.story) &&
          isTransition(body.transitionReceipt)
        )
          return {
            kind: "completed",
            value: {
              decision: body.decision,
              story: body.story,
              transitionReceipt: body.transitionReceipt,
            },
          };
        if (
          isRecord(body) &&
          body.ok === false &&
          isApplicationError(body.error) &&
          response.status >= 400 &&
          response.status < 500
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
  return client;
}
