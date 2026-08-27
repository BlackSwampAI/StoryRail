import type {
  ExtractPersistedSourceFailureError,
  PreserveUrlSourceFailureError,
} from "@/application/source-evidence";
import {
  AGENT_ROLES,
  SOURCE_EXTRACTION_FAILURE_CODES,
  type EditorialActor,
  type SiteId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE =
  "The Source evidence request could not be completed.";

export interface SourceEvidenceUrlClientDependencies {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export interface SourceEvidenceApplicationError {
  readonly code: string;
  readonly message: string;
}

type PreservationValidationError = Exclude<
  PreserveUrlSourceFailureError,
  { readonly code: "DUPLICATE_SOURCE" | "SOURCE_ID_CONFLICT" }
>;
type PreservationConflictError = Extract<
  PreserveUrlSourceFailureError,
  { readonly code: "DUPLICATE_SOURCE" | "SOURCE_ID_CONFLICT" }
>;

export type SourceEvidenceUrlResult =
  | {
      readonly kind: "completed";
      readonly source: UrlSource;
      readonly extraction: SourceExtraction;
    }
  | {
      readonly kind: "preservation-validation-failure";
      readonly error: PreservationValidationError;
    }
  | {
      readonly kind: "preservation-conflict";
      readonly error: PreservationConflictError;
    }
  | {
      readonly kind: "partial-completion";
      readonly stage: "extraction";
      readonly source: UrlSource;
      readonly error: ExtractPersistedSourceFailureError;
    }
  | {
      readonly kind: "interface-rejection";
      readonly error: SourceEvidenceApplicationError;
    }
  | {
      readonly kind: "internal-failure";
      readonly error: SourceEvidenceApplicationError;
    }
  | {
      readonly kind: "unavailable";
      readonly message: typeof SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE;
    };

export type RequestSourceEvidenceUrl = (submittedUrl: string) => Promise<SourceEvidenceUrlResult>;

const PRESERVATION_VALIDATION_CODES = new Set([
  "SOURCE_URL_REQUIRED",
  "SOURCE_URL_TOO_LONG",
  "INVALID_SOURCE_URL",
  "UNSUPPORTED_SOURCE_PROTOCOL",
  "SOURCE_URL_CREDENTIALS_NOT_ALLOWED",
]);
const PRESERVATION_CONFLICT_CODES = new Set(["DUPLICATE_SOURCE", "SOURCE_ID_CONFLICT"]);
const EXTRACTION_ERROR_CODES = new Set([
  "SOURCE_NOT_FOUND",
  "SOURCE_EXTRACTION_ID_CONFLICT",
  "SOURCE_EXTRACTOR_KEY_REQUIRED",
  "SOURCE_EXTRACTOR_VERSION_REQUIRED",
  "EXTRACTED_SOURCE_CONTENT_REQUIRED",
]);
const INTERFACE_ERROR_CODES = new Set([
  "INVALID_JSON",
  "INVALID_REQUEST",
  "UNSUPPORTED_MEDIA_TYPE",
]);
const EXTRACTION_FAILURE_CODES: ReadonlySet<string> = new Set(SOURCE_EXTRACTION_FAILURE_CODES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value) || !isString(value.type)) {
    return false;
  }

  return value.type === "operator"
    ? isString(value.operatorId)
    : value.type === "agent" &&
        isString(value.role) &&
        // The domain owns which roles an agent may act in. Written out here, this list never
        // gained `researcher`, so evidence a Researcher retrieved could not be read back.
        (AGENT_ROLES as readonly string[]).includes(value.role) &&
        isString(value.runId);
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

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isExtraction(value: unknown): value is SourceExtraction {
  if (
    !isRecord(value) ||
    !isString(value.id) ||
    !isString(value.sourceId) ||
    !isRecord(value.extractor) ||
    !isString(value.extractor.key) ||
    !isString(value.extractor.version) ||
    !isActor(value.requestedBy) ||
    !isString(value.startedAt) ||
    !isString(value.completedAt)
  ) {
    return false;
  }

  if (value.outcome === "succeeded") {
    return (
      isRecord(value.document) &&
      value.document.format === "markdown" &&
      isString(value.document.content) &&
      isNullableString(value.document.title) &&
      isNullableString(value.document.byline) &&
      isNullableString(value.document.publishedAt) &&
      isNullableString(value.document.language)
    );
  }

  return (
    value.outcome === "failed" &&
    isRecord(value.failure) &&
    isString(value.failure.code) &&
    EXTRACTION_FAILURE_CODES.has(value.failure.code) &&
    typeof value.failure.retryable === "boolean"
  );
}

function isApplicationError(
  value: unknown,
): value is SourceEvidenceApplicationError & Record<string, unknown> {
  return isRecord(value) && isString(value.code) && isString(value.message);
}

function isPreservationValidationError(value: unknown): value is PreservationValidationError {
  if (!isApplicationError(value) || !PRESERVATION_VALIDATION_CODES.has(value.code)) {
    return false;
  }

  return value.code !== "SOURCE_URL_TOO_LONG" || typeof value.maximumLength === "number";
}

function isPreservationConflictError(value: unknown): value is PreservationConflictError {
  if (!isApplicationError(value) || !PRESERVATION_CONFLICT_CODES.has(value.code)) {
    return false;
  }

  if (value.code === "DUPLICATE_SOURCE") {
    return isString(value.existingSourceId) && isString(value.canonicalUrl);
  }

  return isString(value.sourceId);
}

function isExtractionError(value: unknown): value is ExtractPersistedSourceFailureError {
  if (!isApplicationError(value) || !EXTRACTION_ERROR_CODES.has(value.code)) {
    return false;
  }

  if (value.code === "SOURCE_NOT_FOUND") {
    return isString(value.sourceId);
  }

  if (value.code === "SOURCE_EXTRACTION_ID_CONFLICT") {
    return isString(value.extractionId);
  }

  return true;
}

function unavailable(): SourceEvidenceUrlResult {
  return { kind: "unavailable", message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE };
}

function classifyResponse(status: number, body: unknown): SourceEvidenceUrlResult {
  if (!isRecord(body)) {
    return unavailable();
  }

  if (
    status === 201 &&
    body.ok === true &&
    isSource(body.source) &&
    isExtraction(body.extraction)
  ) {
    return { kind: "completed", source: body.source, extraction: body.extraction };
  }

  if (
    status === 422 &&
    body.ok === false &&
    body.stage === "preservation" &&
    isPreservationValidationError(body.error)
  ) {
    return { kind: "preservation-validation-failure", error: body.error };
  }

  if (
    status === 409 &&
    body.ok === false &&
    body.stage === "preservation" &&
    isPreservationConflictError(body.error)
  ) {
    return { kind: "preservation-conflict", error: body.error };
  }

  if (
    status === 500 &&
    body.ok === false &&
    body.stage === "extraction" &&
    isSource(body.source) &&
    isExtractionError(body.error)
  ) {
    return {
      kind: "partial-completion",
      stage: "extraction",
      source: body.source,
      error: body.error,
    };
  }

  if (
    body.ok === false &&
    isApplicationError(body.error) &&
    ((status === 400 &&
      (body.error.code === "INVALID_JSON" || body.error.code === "INVALID_REQUEST")) ||
      (status === 415 && body.error.code === "UNSUPPORTED_MEDIA_TYPE")) &&
    INTERFACE_ERROR_CODES.has(body.error.code)
  ) {
    return {
      kind: "interface-rejection",
      error: { code: body.error.code, message: body.error.message },
    };
  }

  if (
    status === 500 &&
    body.ok === false &&
    isApplicationError(body.error) &&
    body.error.code === "INTERNAL_SERVER_ERROR" &&
    body.error.message === SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE
  ) {
    return {
      kind: "internal-failure",
      error: { code: body.error.code, message: body.error.message },
    };
  }

  return unavailable();
}

export function createSourceEvidenceUrlClient(
  dependencies: SourceEvidenceUrlClientDependencies,
): RequestSourceEvidenceUrl {
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  return async (submittedUrl) => {
    try {
      const response = await dependencies.fetch(api("/source-evidence/url"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ submittedUrl }),
      });
      const body: unknown = await response.json();

      return classifyResponse(response.status, body);
    } catch {
      return unavailable();
    }
  };
}
