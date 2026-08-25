import type { SourceInboxItem } from "@/application/source-inbox";
import {
  SOURCE_EXTRACTION_FAILURE_CODES,
  PREPARATION_FAILURE_CODES,
  type EditorialActor,
  type SourceExtraction,
  type SourceEvidencePreparation,
  type SourceTriageDecision,
  type SiteId,
  type SourceTriageDecisionKind,
  type UrlSource,
} from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const SOURCE_INBOX_UNAVAILABLE_MESSAGE = "The Source Inbox request could not be completed.";

export interface SourceInboxClientError {
  readonly code: string;
  readonly message: string;
}

export type SourceInboxClientResult<Value> =
  | { readonly kind: "completed"; readonly value: Value }
  | { readonly kind: "application-failure"; readonly error: SourceInboxClientError }
  | { readonly kind: "unavailable"; readonly message: typeof SOURCE_INBOX_UNAVAILABLE_MESSAGE };

export interface SourceInboxClient {
  listPendingSources(): Promise<SourceInboxClientResult<readonly SourceInboxItem[]>>;
  recordTriageDecision(
    sourceId: string,
    decision: SourceTriageDecisionKind,
    storyId: string | null,
    reason: string,
  ): Promise<SourceInboxClientResult<SourceTriageDecision>>;
  prepareEvidence(
    sourceId: string,
    extractionId: string,
  ): Promise<SourceInboxClientResult<SourceEvidencePreparation>>;
  retryExtraction(sourceId: string): Promise<SourceInboxClientResult<SourceExtraction>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join("|") === [...keys].sort().join("|");
}
function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value)) return false;
  return value.type === "operator"
    ? exact(value, ["type", "operatorId"]) && typeof value.operatorId === "string"
    : value.type === "agent" &&
        exact(value, ["type", "role", "runId"]) &&
        ["assignment_editor", "writer", "fact_checker", "editor_in_chief"].includes(
          String(value.role),
        ) &&
        typeof value.runId === "string";
}
function isSource(value: unknown): value is UrlSource {
  return (
    isRecord(value) &&
    exact(value, ["id", "type", "submittedUrl", "canonicalUrl", "submittedBy", "receivedAt"]) &&
    typeof value.id === "string" &&
    value.type === "url" &&
    typeof value.submittedUrl === "string" &&
    typeof value.canonicalUrl === "string" &&
    isActor(value.submittedBy) &&
    typeof value.receivedAt === "string"
  );
}
function stringOrNull(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function isExtraction(value: unknown): value is SourceExtraction {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.sourceId !== "string" ||
    !isRecord(value.extractor) ||
    !exact(value.extractor, ["key", "version"]) ||
    typeof value.extractor.key !== "string" ||
    typeof value.extractor.version !== "string" ||
    !isActor(value.requestedBy) ||
    typeof value.startedAt !== "string" ||
    typeof value.completedAt !== "string"
  )
    return false;
  const common = [
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
      exact(value, [...common, "document"]) &&
      isRecord(value.document) &&
      exact(value.document, ["format", "content", "title", "byline", "publishedAt", "language"]) &&
      value.document.format === "markdown" &&
      typeof value.document.content === "string" &&
      stringOrNull(value.document.title) &&
      stringOrNull(value.document.byline) &&
      stringOrNull(value.document.publishedAt) &&
      stringOrNull(value.document.language)
    );
  }
  return (
    value.outcome === "failed" &&
    exact(value, [...common, "failure"]) &&
    isRecord(value.failure) &&
    exact(value.failure, ["code", "retryable"]) &&
    SOURCE_EXTRACTION_FAILURE_CODES.includes(value.failure.code as never) &&
    typeof value.failure.retryable === "boolean"
  );
}
function isInputMeasurement(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ["rawCharacters", "submittedCharacters"]) &&
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
    typeof value.id !== "string" ||
    typeof value.sourceId !== "string" ||
    typeof value.extractionId !== "string" ||
    !isRecord(value.model) ||
    !exact(value.model, ["provider", "model"]) ||
    typeof value.model.provider !== "string" ||
    value.model.provider.trim().length === 0 ||
    typeof value.model.model !== "string" ||
    value.model.model.trim().length === 0 ||
    !isRecord(value.preparer) ||
    !exact(value.preparer, ["key", "version"]) ||
    typeof value.preparer.key !== "string" ||
    typeof value.preparer.version !== "string" ||
    !isActor(value.requestedBy) ||
    !isInputMeasurement(value.input) ||
    typeof value.startedAt !== "string" ||
    typeof value.completedAt !== "string"
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
      exact(value, [...common, "document"]) &&
      isRecord(value.document) &&
      exact(value.document, ["format", "content", "title", "byline", "publishedAt", "language"]) &&
      value.document.format === "markdown" &&
      typeof value.document.content === "string" &&
      value.document.content.trim().length > 0 &&
      stringOrNull(value.document.title) &&
      stringOrNull(value.document.byline) &&
      stringOrNull(value.document.publishedAt) &&
      stringOrNull(value.document.language)
    );
  }
  return (
    value.outcome === "failed" &&
    exact(value, [...common, "failure"]) &&
    isRecord(value.failure) &&
    exact(value.failure, ["code", "retryable"]) &&
    PREPARATION_FAILURE_CODES.includes(value.failure.code as never) &&
    typeof value.failure.retryable === "boolean"
  );
}
function isItems(value: unknown): value is readonly SourceInboxItem[] {
  return (
    Array.isArray(value) &&
    value.every((item) => {
      if (
        !isRecord(item) ||
        !exact(item, ["source", "extractions", "preparations"]) ||
        !isSource(item.source) ||
        !Array.isArray(item.extractions) ||
        !Array.isArray(item.preparations)
      ) {
        return false;
      }
      const source = item.source;
      const extractionIds = new Set(
        item.extractions.filter(isExtraction).map((extraction) => extraction.id),
      );
      return (
        item.extractions.every(
          (extraction) => isExtraction(extraction) && extraction.sourceId === source.id,
        ) &&
        item.preparations.every(
          (preparation) =>
            isPreparation(preparation) &&
            preparation.sourceId === source.id &&
            extractionIds.has(preparation.extractionId),
        )
      );
    })
  );
}
function isDecision(value: unknown): value is SourceTriageDecision {
  return (
    isRecord(value) &&
    exact(value, ["sourceId", "decision", "storyId", "reason", "decidedBy", "decidedAt"]) &&
    typeof value.sourceId === "string" &&
    ["new_story", "existing_story", "skip"].includes(String(value.decision)) &&
    stringOrNull(value.storyId) &&
    typeof value.reason === "string" &&
    isActor(value.decidedBy) &&
    typeof value.decidedAt === "string" &&
    (value.decision === "skip" ? value.storyId === null : typeof value.storyId === "string")
  );
}
function isError(value: unknown): value is SourceInboxClientError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}
const TRIAGE_ERRORS: Readonly<Record<number, ReadonlySet<string>>> = {
  400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
  404: new Set(["SOURCE_NOT_FOUND"]),
  409: new Set([
    "SOURCE_ALREADY_ATTACHED",
    "STORY_SOURCE_ATTACHMENT_NOT_FOUND",
    "SOURCE_TRIAGE_CONFLICT",
  ]),
  415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
  422: new Set([
    "SOURCE_TRIAGE_REASON_REQUIRED",
    "SOURCE_TRIAGE_STORY_REQUIRED",
    "SOURCE_TRIAGE_STORY_FORBIDDEN",
  ]),
};
const PREPARATION_ERRORS: Readonly<Record<number, ReadonlySet<string>>> = {
  400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
  404: new Set(["SOURCE_NOT_FOUND", "SOURCE_EXTRACTION_NOT_FOUND"]),
  409: new Set(["SOURCE_EVIDENCE_PREPARATION_ID_CONFLICT"]),
  415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
  422: new Set(["SOURCE_EXTRACTION_NOT_PREPARABLE"]),
};
const EXTRACTION_ERRORS: Readonly<Record<number, ReadonlySet<string>>> = {
  400: new Set(["INVALID_JSON", "INVALID_REQUEST"]),
  404: new Set(["SOURCE_NOT_FOUND"]),
  409: new Set(["SOURCE_EXTRACTION_ID_CONFLICT"]),
  415: new Set(["UNSUPPORTED_MEDIA_TYPE"]),
  422: new Set([
    "SOURCE_EXTRACTOR_KEY_REQUIRED",
    "SOURCE_EXTRACTOR_VERSION_REQUIRED",
    "EXTRACTED_SOURCE_CONTENT_REQUIRED",
  ]),
};
const unavailable = (): SourceInboxClientResult<never> => ({
  kind: "unavailable",
  message: SOURCE_INBOX_UNAVAILABLE_MESSAGE,
});

export function createSourceInboxClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: typeof globalThis.fetch;
}): SourceInboxClient {
  const { fetch } = dependencies;
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  return {
    async listPendingSources() {
      try {
        const response = await fetch(api("/source-inbox"), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        return response.status === 200 &&
          isRecord(body) &&
          body.ok === true &&
          isItems(body.sources)
          ? { kind: "completed", value: body.sources }
          : unavailable();
      } catch {
        return unavailable();
      }
    },
    async recordTriageDecision(sourceId, decision, storyId, reason) {
      try {
        const response = await fetch(api(`/sources/${encodeURIComponent(sourceId)}/triage`), {
          method: "PUT",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ decision, storyId, reason }),
        });
        const body: unknown = await response.json();
        if (
          response.status === 200 &&
          isRecord(body) &&
          body.ok === true &&
          isDecision(body.triageDecision)
        )
          return { kind: "completed", value: body.triageDecision };
        if (
          response.status >= 400 &&
          response.status < 500 &&
          isRecord(body) &&
          body.ok === false &&
          isError(body.error) &&
          TRIAGE_ERRORS[response.status]?.has(body.error.code) === true
        )
          return { kind: "application-failure", error: body.error };
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    async prepareEvidence(sourceId, extractionId) {
      try {
        const response = await fetch(api(`/sources/${encodeURIComponent(sourceId)}/preparations`), {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ extractionId }),
        });
        const body: unknown = await response.json();
        if (
          response.status === 201 &&
          isRecord(body) &&
          body.ok === true &&
          isPreparation(body.preparation) &&
          body.preparation.sourceId === sourceId &&
          body.preparation.extractionId === extractionId
        ) {
          return { kind: "completed", value: body.preparation };
        }
        if (
          response.status >= 400 &&
          response.status < 500 &&
          isRecord(body) &&
          body.ok === false &&
          isError(body.error) &&
          PREPARATION_ERRORS[response.status]?.has(body.error.code) === true
        ) {
          return { kind: "application-failure", error: body.error };
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
    async retryExtraction(sourceId) {
      try {
        const response = await fetch(api(`/sources/${encodeURIComponent(sourceId)}/extractions`), {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const body: unknown = await response.json();
        // A recorded extraction failure is a completed attempt, not a request failure.
        if (
          response.status === 201 &&
          isRecord(body) &&
          body.ok === true &&
          isExtraction(body.extraction) &&
          body.extraction.sourceId === sourceId
        ) {
          return { kind: "completed", value: body.extraction };
        }
        if (
          response.status >= 400 &&
          response.status < 500 &&
          isRecord(body) &&
          body.ok === false &&
          isError(body.error) &&
          EXTRACTION_ERRORS[response.status]?.has(body.error.code) === true
        ) {
          return { kind: "application-failure", error: body.error };
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}
