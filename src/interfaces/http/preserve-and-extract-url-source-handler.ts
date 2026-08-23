import type { PreserveAndExtractUrlSourceResult } from "@/application/source-evidence";
import { isCredentialUnavailableError, operatorId, type OperatorActor } from "@/domain/editorial";
import type { SourceEvidenceRuntime } from "@/runtime";

export interface PreserveAndExtractUrlSourceHttpRequestBody {
  readonly submittedUrl: string;
}

export interface PreserveAndExtractUrlSourceHttpHandlerDependencies {
  readonly getRuntime: () => SourceEvidenceRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}

export type PreserveAndExtractUrlSourceHttpHandler = (request: Request) => Promise<Response>;

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
    message: "The request body must contain exactly one string property named submittedUrl.",
  }),
});

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Source evidence request could not be completed.",
  }),
});

const PRESERVATION_VALIDATION_ERROR_CODES = new Set([
  "SOURCE_URL_REQUIRED",
  "SOURCE_URL_TOO_LONG",
  "INVALID_SOURCE_URL",
  "UNSUPPORTED_SOURCE_PROTOCOL",
  "SOURCE_URL_CREDENTIALS_NOT_ALLOWED",
]);

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_RESPONSE_HEADERS,
  });
}

function hasJsonMediaType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function isRequestBody(value: unknown): value is PreserveAndExtractUrlSourceHttpRequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return (
    keys.length === 1 &&
    keys[0] === "submittedUrl" &&
    Object.prototype.hasOwnProperty.call(value, "submittedUrl") &&
    typeof (value as Record<string, unknown>).submittedUrl === "string"
  );
}

function statusForApplicationResult(result: PreserveAndExtractUrlSourceResult): number {
  if (result.ok) {
    return 201;
  }

  if (result.stage === "extraction") {
    // Nothing was attempted and no extraction was recorded, so this is not a server fault. The
    // model routes answer 503 for the same condition; a client that handles a missing credential
    // must not have to special-case which route reported it.
    return isCredentialUnavailableError(result.error) ? 503 : 500;
  }

  if (PRESERVATION_VALIDATION_ERROR_CODES.has(result.error.code)) {
    return 422;
  }

  return 409;
}

export function createPreserveAndExtractUrlSourceHttpHandler(
  dependencies: PreserveAndExtractUrlSourceHttpHandlerDependencies,
): PreserveAndExtractUrlSourceHttpHandler {
  return async (request) => {
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

      const submittedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperatorId),
      };
      const runtime = dependencies.getRuntime();
      const result = await runtime.preserveAndExtractUrlSource({
        submittedUrl: body.submittedUrl,
        submittedBy,
      });

      return jsonResponse(result, statusForApplicationResult(result));
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
