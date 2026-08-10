import type { RecordSourceTriageDecisionWorkflowResult } from "@/application/source-triage";
import {
  operatorId,
  sourceId,
  storyId,
  type OperatorActor,
  type SourceTriageDecisionKind,
} from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

interface RequestBody {
  readonly decision: SourceTriageDecisionKind;
  readonly storyId: string | null;
  readonly reason: string;
}

export interface SourceTriageRouteContext {
  readonly params: Promise<{ readonly sourceId: string }>;
}

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers });

function hasJsonMediaType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function isBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === 3 &&
    keys[0] === "decision" &&
    keys[1] === "reason" &&
    keys[2] === "storyId" &&
    (record.decision === "new_story" ||
      record.decision === "existing_story" ||
      record.decision === "skip") &&
    (typeof record.storyId === "string" || record.storyId === null) &&
    typeof record.reason === "string"
  );
}

function statusFor(result: RecordSourceTriageDecisionWorkflowResult): number {
  if (result.ok) return 200;
  switch (result.error.code) {
    case "SOURCE_NOT_FOUND":
      return 404;
    case "SOURCE_TRIAGE_REASON_REQUIRED":
    case "SOURCE_TRIAGE_STORY_REQUIRED":
    case "SOURCE_TRIAGE_STORY_FORBIDDEN":
      return 422;
    case "SOURCE_ALREADY_ATTACHED":
    case "STORY_SOURCE_ATTACHMENT_NOT_FOUND":
    case "SOURCE_TRIAGE_CONFLICT":
      return 409;
  }
}

const internalFailure = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "The Source triage request could not be completed.",
  },
} as const;

export function createRecordSourceTriageDecisionHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  return async (request: Request, context: SourceTriageRouteContext): Promise<Response> => {
    if (!hasJsonMediaType(request)) {
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
            message: "The request body must contain exactly decision, storyId, and reason.",
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
      const decidedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperator),
      };
      const route = await context.params;
      const result = await dependencies.getRuntime().recordSourceTriageDecision({
        sourceId: sourceId(route.sourceId),
        decision: body.decision,
        storyId: body.storyId === null ? null : storyId(body.storyId),
        reason: body.reason,
        decidedBy,
      });
      return respond(result, statusFor(result));
    } catch {
      return respond(internalFailure, 500);
    }
  };
}
