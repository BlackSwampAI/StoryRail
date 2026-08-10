import { isDeepStrictEqual } from "node:util";

import {
  AGENT_ROLES,
  PREPARATION_FAILURE_CODES,
  type EditorialActor,
  type PreparationFailureCode,
  type SourceEvidencePreparation,
} from "@/domain/editorial";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
}

function isActor(value: unknown): value is EditorialActor {
  if (!isRecord(value)) return false;
  if (value.type === "operator") {
    return exact(value, ["type", "operatorId"]) && typeof value.operatorId === "string";
  }
  return (
    value.type === "agent" &&
    exact(value, ["type", "role", "runId"]) &&
    typeof value.role === "string" &&
    (AGENT_ROLES as readonly string[]).includes(value.role) &&
    typeof value.runId === "string"
  );
}

function isDescriptor(value: unknown, keys: readonly [string, string]): boolean {
  if (!isRecord(value) || !exact(value, keys)) return false;
  const first = value[keys[0]];
  const second = value[keys[1]];
  return (
    typeof first === "string" &&
    first.trim().length > 0 &&
    first === first.trim() &&
    typeof second === "string" &&
    second.trim().length > 0 &&
    second === second.trim()
  );
}

function stringOrNull(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isDocument(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ["format", "content", "title", "byline", "publishedAt", "language"]) &&
    value.format === "markdown" &&
    typeof value.content === "string" &&
    value.content.trim().length > 0 &&
    stringOrNull(value.title) &&
    stringOrNull(value.byline) &&
    stringOrNull(value.publishedAt) &&
    stringOrNull(value.language)
  );
}

function isFailureCode(value: unknown): value is PreparationFailureCode {
  return (
    typeof value === "string" && (PREPARATION_FAILURE_CODES as readonly string[]).includes(value)
  );
}

function isFailure(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ["code", "retryable"]) &&
    isFailureCode(value.code) &&
    typeof value.retryable === "boolean"
  );
}

export function decodePostgresSourceEvidencePreparation(
  payload: unknown,
  invariantError: () => Error,
): SourceEvidencePreparation {
  if (
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    typeof payload.sourceId !== "string" ||
    typeof payload.extractionId !== "string" ||
    !isDescriptor(payload.model, ["provider", "model"]) ||
    !isDescriptor(payload.preparer, ["key", "version"]) ||
    !isActor(payload.requestedBy) ||
    typeof payload.startedAt !== "string" ||
    typeof payload.completedAt !== "string"
  ) {
    throw invariantError();
  }
  const common = [
    "id",
    "sourceId",
    "extractionId",
    "model",
    "preparer",
    "requestedBy",
    "startedAt",
    "completedAt",
    "outcome",
  ];
  if (
    payload.outcome === "succeeded" &&
    exact(payload, [...common, "document"]) &&
    isDocument(payload.document)
  ) {
    return structuredClone(payload) as unknown as SourceEvidencePreparation;
  }
  if (
    payload.outcome === "failed" &&
    exact(payload, [...common, "failure"]) &&
    isFailure(payload.failure)
  ) {
    return structuredClone(payload) as unknown as SourceEvidencePreparation;
  }
  throw invariantError();
}
