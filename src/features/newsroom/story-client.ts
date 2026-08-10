import {
  SOURCE_EXTRACTION_FAILURE_CODES,
  type EditorialActor,
  type SourceExtraction,
  type Story,
  type StorySourceAttachment,
  type UrlSource,
} from "@/domain/editorial";
import type { StoryInspection } from "@/application/story-inspection";
import type { StoryListItem } from "@/application/story-listing";

export const STORY_REQUEST_UNAVAILABLE_MESSAGE = "The Story request could not be completed.";

export interface StoryClientDependencies {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
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

function isStory(value: unknown): value is Story {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isString(value.state) &&
    STORY_STATES.has(value.state) &&
    typeof value.revisionCycle === "number" &&
    Number.isInteger(value.revisionCycle) &&
    value.revisionCycle >= 0 &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
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
  if (!isRecord(value) || !isStory(value.story) || !Array.isArray(value.sources)) {
    return false;
  }
  const story = value.story;
  return value.sources.every((item) => {
    if (
      !isRecord(item) ||
      !hasExactKeys(item, ["attachment", "source", "extractions"]) ||
      !isAttachment(item.attachment) ||
      !isSource(item.source) ||
      !Array.isArray(item.extractions) ||
      !item.extractions.every(isExtraction)
    ) {
      return false;
    }
    const sourceId = item.source.id;
    return (
      item.attachment.storyId === story.id &&
      item.attachment.sourceId === sourceId &&
      item.extractions.every((extraction) => extraction.sourceId === sourceId)
    );
  });
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

async function request<Value>(
  fetch: StoryClientDependencies["fetch"],
  input: string,
  init: RequestInit,
  successStatus: number,
  successKey: "story" | "stories" | "attachment" | "inspection",
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
  const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" };
  return {
    listStories: () =>
      request(
        dependencies.fetch,
        "/api/stories",
        { method: "GET", headers: { Accept: "application/json" } },
        200,
        "stories",
        isStoryList,
        {},
      ),
    createStory: (title) =>
      request(
        dependencies.fetch,
        "/api/stories",
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
        `/api/stories/${encodeURIComponent(storyId)}/sources`,
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
        `/api/stories/${encodeURIComponent(storyId)}`,
        { method: "GET", headers: { Accept: "application/json" } },
        200,
        "inspection",
        isInspection,
        { 404: new Set(["STORY_NOT_FOUND"]) },
      ),
  };
}

export const storyClient = createStoryClient({
  fetch: (input, init) => globalThis.fetch(input, init),
});
