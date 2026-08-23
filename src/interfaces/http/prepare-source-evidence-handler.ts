import type { PrepareSourceEvidenceResult } from "@/application/source-evidence-preparation";
import { operatorId, sourceExtractionId, sourceId, type OperatorActor } from "@/domain/editorial";
import type { EvidencePreparationRuntime } from "@/runtime";

export interface SourcePreparationRouteContext {
  readonly params: Promise<{ readonly sourceId: string }>;
}

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers });

function statusFor(result: PrepareSourceEvidenceResult): number {
  if (result.ok) return 201;
  switch (result.error.code) {
    case "SOURCE_NOT_FOUND":
    case "SOURCE_EXTRACTION_NOT_FOUND":
      return 404;
    case "SOURCE_EXTRACTION_NOT_PREPARABLE":
      return 422;
    case "SOURCE_EVIDENCE_PREPARATION_ID_CONFLICT":
      return 409;
    // Nothing was attempted, and the newsroom cannot attempt it until an operator acts. Named
    // separately so the response says which credential and which of the two remedies applies.
    case "OPENROUTER_API_KEY_REQUIRED":
    case "FIRECRAWL_API_KEY_REQUIRED":
    case "CREDENTIAL_NOT_CONFIGURED":
    case "CREDENTIAL_KEY_UNAVAILABLE":
    case "CREDENTIAL_UNREADABLE":
      return 503;
  }
}

function isBody(value: unknown): value is { readonly extractionId: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && typeof record.extractionId === "string";
}

const internalFailure = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "The evidence preparation request could not be completed.",
  },
} as const;

export function createPrepareSourceEvidenceHttpHandler(dependencies: {
  readonly getRuntime: () => EvidencePreparationRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  return async (request: Request, context: SourcePreparationRouteContext): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return respond(
        {
          ok: false,
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "The request Content-Type must be application/json.",
          },
        },
        415,
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond(
        {
          ok: false,
          error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." },
        },
        400,
      );
    }
    if (!isBody(body)) {
      return respond(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "The request body must contain exactly extractionId.",
          },
        },
        400,
      );
    }

    try {
      const configuredOperator = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (configuredOperator === undefined || configuredOperator.trim().length === 0) {
        return respond(internalFailure, 500);
      }
      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperator),
      };
      const route = await context.params;
      const result = await dependencies.getRuntime().prepareSourceEvidence({
        sourceId: sourceId(route.sourceId),
        extractionId: sourceExtractionId(body.extractionId),
        requestedBy,
      });
      return respond(result, statusFor(result));
    } catch {
      return respond(internalFailure, 500);
    }
  };
}
