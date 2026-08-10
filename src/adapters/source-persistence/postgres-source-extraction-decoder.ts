import { isDeepStrictEqual } from "node:util";

import {
  AGENT_ROLES,
  SOURCE_EXTRACTION_FAILURE_CODES,
  type AgentRole,
  type EditorialActor,
  type SourceExtraction,
  type SourceExtractionFailureCode,
} from "@/domain/editorial";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function isStringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "operator") {
    return hasExactKeys(value, ["type", "operatorId"]) && typeof value.operatorId === "string";
  }

  return (
    value.type === "agent" &&
    hasExactKeys(value, ["type", "role", "runId"]) &&
    isAgentRole(value.role) &&
    typeof value.runId === "string"
  );
}

function isExtractorDescriptor(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["key", "version"]) &&
    typeof value.key === "string" &&
    typeof value.version === "string"
  );
}

function isDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["format", "content", "title", "byline", "publishedAt", "language"]) &&
    value.format === "markdown" &&
    typeof value.content === "string" &&
    isStringOrNull(value.title) &&
    isStringOrNull(value.byline) &&
    isStringOrNull(value.publishedAt) &&
    isStringOrNull(value.language)
  );
}

function isFailureCode(value: unknown): value is SourceExtractionFailureCode {
  return (
    typeof value === "string" &&
    (SOURCE_EXTRACTION_FAILURE_CODES as readonly string[]).includes(value)
  );
}

function isFailure(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["code", "retryable"]) &&
    isFailureCode(value.code) &&
    typeof value.retryable === "boolean"
  );
}

function hasCommonFields(payload: Record<string, unknown>): boolean {
  return (
    typeof payload.id === "string" &&
    typeof payload.sourceId === "string" &&
    isExtractorDescriptor(payload.extractor) &&
    isActor(payload.requestedBy) &&
    typeof payload.startedAt === "string" &&
    typeof payload.completedAt === "string"
  );
}

export function decodePostgresSourceExtraction(
  payload: unknown,
  invariantError: () => Error,
): SourceExtraction {
  if (!isRecord(payload) || !hasCommonFields(payload)) {
    throw invariantError();
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

  if (
    payload.outcome === "succeeded" &&
    hasExactKeys(payload, [...commonKeys, "document"]) &&
    isDocument(payload.document)
  ) {
    return structuredClone(payload) as unknown as SourceExtraction;
  }

  if (
    payload.outcome === "failed" &&
    hasExactKeys(payload, [...commonKeys, "failure"]) &&
    isFailure(payload.failure)
  ) {
    return structuredClone(payload) as unknown as SourceExtraction;
  }

  throw invariantError();
}
