import {
  agentProfileSchema,
  agentRunSchema,
  agentToolCallSchema,
  articleRevisionSchema,
  articleSchema,
  assignmentSchema,
  createArticle,
  createArticleRevision,
  createReviewDecision,
  recordAgentRun,
  recordAgentToolCall,
  recordStoryDelivery,
  reviewDecisionSchema,
  sourceEvidencePreparationSchema,
  sourceExtractionSchema,
  storyDeliverySchema,
  storySchema,
  storySourceAttachmentSchema,
  storyTransitionReceiptSchema,
  urlSourceSchema,
  type AgentProfile,
  type Assignment,
  type AgentRun,
  type AgentToolCall,
  type Article,
  type ArticleRevision,
  type ReviewDecision,
  type SourceExtraction,
  type SourceEvidencePreparation,
  type Story,
  type StoryDelivery,
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

/**
 * What became of one request to deliver.
 *
 * "Refused" and "not attempted" are kept apart all the way to the screen, because they are not
 * degrees of the same thing: a refusal has a durable delivery record behind it and a destination
 * that said no, while nothing at all happened when no destination or credential is configured.
 * An operator told only that delivery "failed" goes looking at the website instead of at their
 * own settings, which is the confusion this whole panel exists to end.
 */
export type DeliverStoryOutcome =
  | { readonly kind: "delivered"; readonly delivery: StoryDelivery }
  | {
      readonly kind: "refused";
      readonly error: StoryClientApplicationError;
      readonly delivery: StoryDelivery | null;
    }
  | { readonly kind: "not-attempted"; readonly error: StoryClientApplicationError }
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
  /**
   * Asks for one delivery of a published Story. There is nothing to send: the latest Revision is
   * what goes, and where it goes is the Site's configured destination.
   */
  readonly deliverStory: (storyId: string) => Promise<DeliverStoryOutcome>;
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

/**
 * The browser reads an editorial record through the domain's own account of that record, rather
 * than through a second description kept here.
 *
 * Five times now a shape has been extended and the hand-written reader in this file did not
 * learn about it, and each time it surfaced the same way: the record was correct and the screen
 * refused to show it. These schemas are pure and have no I/O, so the module that decodes a
 * PostgreSQL payload runs unchanged in a browser bundle. Where the domain also has a writer that
 * decides whether a record is possible, that writer is called too, so the browser accepts
 * exactly what the newsroom is able to have recorded.
 *
 * A few checks stay here on purpose, layered on top: they are this reader's own, not the
 * domain's, and folding them in would change what the database accepts.
 */
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

function isExtraction(value: unknown): value is SourceExtraction {
  return sourceExtractionSchema.safeParse(value).success;
}

function isPreparation(value: unknown): value is SourceEvidencePreparation {
  return sourceEvidencePreparationSchema.safeParse(value).success;
}

function isStory(value: unknown): value is Story {
  return storySchema.safeParse(value).success;
}

function isProfile(value: unknown): value is AgentProfile {
  const parsed = agentProfileSchema.safeParse(value);
  // This reader's own: a newsroom's Profiles ship built in, and the only kind an operator may
  // add is a Writer.
  return parsed.success && (parsed.data.builtIn || parsed.data.role === "writer");
}

function isAssignment(value: unknown): value is Assignment {
  return assignmentSchema.safeParse(value).success;
}

function isTransition(value: unknown): value is StoryTransitionReceipt {
  return storyTransitionReceiptSchema.safeParse(value).success;
}

function isAgentRun(value: unknown): value is AgentRun {
  const parsed = agentRunSchema.safeParse(value);
  // The schema says a run of this role could look like this; the domain's writer says a run of
  // this role could actually have happened. Only the second knows that a Writer revision answers
  // a Director who asked for changes, or that findings belong to a grounding refusal alone.
  return parsed.success && recordAgentRun(parsed.data as unknown as AgentRun).ok;
}

function isReviewDecision(value: unknown): value is ReviewDecision {
  const parsed = reviewDecisionSchema.safeParse(value);
  return parsed.success && createReviewDecision(parsed.data as unknown as ReviewDecision).ok;
}

function isDelivery(value: unknown): value is StoryDelivery {
  const parsed = storyDeliverySchema.safeParse(value);
  if (!parsed.success || !recordStoryDelivery(parsed.data as unknown as StoryDelivery).ok)
    return false;
  const delivery = parsed.data;
  // This reader's own: the pair of slugs is the fact that the destination renamed the page, so a
  // pair naming the same slug tells the panel nothing it could show an operator.
  return (
    delivery.outcome !== "succeeded" ||
    delivery.result.requestedSlug === undefined ||
    delivery.result.requestedSlug !== delivery.result.assignedSlug
  );
}

function isToolCall(value: unknown): value is AgentToolCall {
  const parsed = agentToolCallSchema.safeParse(value);
  return parsed.success && recordAgentToolCall(parsed.data as unknown as AgentToolCall).ok;
}

function isArticle(value: unknown): value is Article {
  const parsed = articleSchema.safeParse(value);
  return parsed.success && createArticle(parsed.data as unknown as Article).ok;
}

function isArticleRevision(value: unknown): value is ArticleRevision {
  const parsed = articleRevisionSchema.safeParse(value);
  return (
    parsed.success &&
    createArticleRevision(parsed.data as unknown as ArticleRevision).ok &&
    // This reader's own: the Revision must name the run that wrote it. The database checks the
    // same thing against the row the payload came from, which the browser has no equivalent of.
    parsed.data.createdBy.runId === parsed.data.agentRunId
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
  return urlSourceSchema.safeParse(value).success;
}

function isAttachment(value: unknown): value is StorySourceAttachment {
  return storySourceAttachmentSchema.safeParse(value).success;
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
      "deliveries",
      "toolCalls",
    ]) ||
    !isStory(value.story) ||
    !Array.isArray(value.sources) ||
    !Array.isArray(value.transitions) ||
    !value.transitions.every(isTransition) ||
    !Array.isArray(value.agentRuns) ||
    !value.agentRuns.every(isAgentRun) ||
    !Array.isArray(value.reviewDecisions) ||
    !value.reviewDecisions.every(isReviewDecision) ||
    !Array.isArray(value.deliveries) ||
    !value.deliveries.every(isDelivery) ||
    !Array.isArray(value.toolCalls) ||
    !value.toolCalls.every(isToolCall)
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
  // Everything an inspection carries must belong to the Story it was asked about. That is this
  // reader's own question: no single persisted record can answer it.
  return (
    assignmentValid &&
    articleValid &&
    value.transitions.every((receipt) => receipt.storyId === story.id) &&
    value.agentRuns.every((run) => run.storyId === story.id) &&
    value.reviewDecisions.every((decision) => decision.storyId === story.id) &&
    value.deliveries.every((delivery) => delivery.storyId === story.id) &&
    value.toolCalls.every((call) => call.storyId === story.id) &&
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
    isStory(value.story) &&
    Number.isSafeInteger(value.sourceCount) &&
    (value.sourceCount as number) >= 0
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
    async deliverStory(storyId) {
      const unreadableOutcome: DeliverStoryOutcome = {
        kind: "unavailable",
        message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
      };
      try {
        const response = await dependencies.fetch(
          api(`/stories/${encodeURIComponent(storyId)}/deliveries`),
          { method: "POST", headers: jsonHeaders, body: JSON.stringify({}) },
        );
        const body: unknown = await response.json();
        if (!isRecord(body)) return unreadableOutcome;
        if (response.status === 201 && body.ok === true && isDelivery(body.delivery))
          return { kind: "delivered", delivery: body.delivery };
        if (body.ok !== false || !isApplicationError(body.error)) return unreadableOutcome;
        // A 502 is an attempt the destination refused, and the record of it came back with the
        // answer. A 503 is work that never left, and carries no record because none was written.
        if (response.status === 502)
          return {
            kind: "refused",
            error: body.error,
            delivery: isDelivery(body.delivery) ? body.delivery : null,
          };
        if (response.status === 503) return { kind: "not-attempted", error: body.error };
        if (response.status === 404 || response.status === 409)
          return { kind: "application-failure", error: body.error };
        return unreadableOutcome;
      } catch {
        return unreadableOutcome;
      }
    },
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
