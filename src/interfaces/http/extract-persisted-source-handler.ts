import type { ExtractPersistedSourceResult } from "@/application/source-evidence";
import { operatorId, sourceId, type OperatorActor } from "@/domain/editorial";
import type { SourceEvidenceRuntime } from "@/runtime";

export interface SourceExtractionRouteContext {
  readonly params: Promise<{ readonly sourceId: string }>;
}

export interface ExtractPersistedSourceHttpHandlerDependencies {
  readonly getRuntime: () => SourceEvidenceRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}

export type ExtractPersistedSourceHttpHandler = (
  request: Request,
  context: SourceExtractionRouteContext,
) => Promise<Response>;

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const UNSUPPORTED_MEDIA_TYPE_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request Content-Type must be application/json.",
  }),
});

const INVALID_JSON_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INVALID_JSON",
    message: "The request body must contain valid JSON.",
  }),
});

const INVALID_REQUEST_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INVALID_REQUEST",
    message: "The request body must be an empty JSON object.",
  }),
});

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Source extraction request could not be completed.",
  }),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_RESPONSE_HEADERS });
}

function hasJsonMediaType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

// The Source identity is carried by the route, so the body exists only to keep the
// JSON contract uniform across the Source endpoints.
function isRequestBody(value: unknown): value is Record<string, never> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

// A recorded extraction failure is a durable attempt, not a request failure: it appends
// to the immutable history exactly like a success and is reported as 201.
function statusForApplicationResult(result: ExtractPersistedSourceResult): number {
  if (result.ok) return 201;

  switch (result.error.code) {
    case "SOURCE_NOT_FOUND":
      return 404;
    case "SOURCE_EXTRACTION_ID_CONFLICT":
      return 409;
    case "SOURCE_EXTRACTOR_KEY_REQUIRED":
    case "SOURCE_EXTRACTOR_VERSION_REQUIRED":
    case "EXTRACTED_SOURCE_CONTENT_REQUIRED":
      return 422;
  }
}

export function createExtractPersistedSourceHttpHandler(
  dependencies: ExtractPersistedSourceHttpHandlerDependencies,
): ExtractPersistedSourceHttpHandler {
  return async (request, context) => {
    if (!hasJsonMediaType(request)) {
      return jsonResponse(UNSUPPORTED_MEDIA_TYPE_RESPONSE, 415);
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(INVALID_JSON_RESPONSE, 400);
    }

    if (!isRequestBody(body)) {
      return jsonResponse(INVALID_REQUEST_RESPONSE, 400);
    }

    try {
      const configuredOperatorId = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;

      if (configuredOperatorId === undefined || configuredOperatorId.trim().length === 0) {
        return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
      }

      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperatorId),
      };
      const route = await context.params;
      const result = await dependencies.getRuntime().extractPersistedSource({
        sourceId: sourceId(route.sourceId),
        requestedBy,
      });

      return jsonResponse(result, statusForApplicationResult(result));
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
