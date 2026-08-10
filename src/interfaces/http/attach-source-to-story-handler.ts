import type { AttachSourceToStoryWorkflowResult } from "@/application/story-source-attachment";
import { operatorId, sourceId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

export interface AttachSourceToStoryHttpRequestBody {
  readonly sourceId: string;
  readonly relevance: string;
}

export interface StoryRouteContext {
  readonly params: Promise<{ readonly storyId: string }>;
}

export interface AttachSourceToStoryHttpHandlerDependencies {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}

export type AttachSourceToStoryHttpHandler = (
  request: Request,
  context: StoryRouteContext,
) => Promise<Response>;

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_RESPONSE_HEADERS });
}

function hasJsonMediaType(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function isRequestBody(value: unknown): value is AttachSourceToStoryHttpRequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  return (
    keys.length === 2 &&
    keys[0] === "relevance" &&
    keys[1] === "sourceId" &&
    Object.prototype.hasOwnProperty.call(value, "sourceId") &&
    Object.prototype.hasOwnProperty.call(value, "relevance") &&
    typeof (value as Record<string, unknown>).sourceId === "string" &&
    typeof (value as Record<string, unknown>).relevance === "string"
  );
}

function statusForResult(result: AttachSourceToStoryWorkflowResult): number {
  if (result.ok) {
    return 200;
  }

  switch (result.error.code) {
    case "STORY_SOURCE_RELEVANCE_REQUIRED":
      return 422;
    case "STORY_NOT_FOUND":
    case "SOURCE_NOT_FOUND":
      return 404;
    case "STORY_SOURCE_CONFLICT":
      return 409;
  }
}

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
    message:
      "The request body must contain exactly two string properties named sourceId and relevance.",
  }),
});

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Story request could not be completed.",
  }),
});

export function createAttachSourceToStoryHttpHandler(
  dependencies: AttachSourceToStoryHttpHandlerDependencies,
): AttachSourceToStoryHttpHandler {
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

      const attachedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperatorId),
      };
      const routeParameters = await context.params;
      const result = await dependencies.getRuntime().attachSourceToStory({
        storyId: storyId(routeParameters.storyId),
        sourceId: sourceId(body.sourceId),
        relevance: body.relevance,
        attachedBy,
      });

      return jsonResponse(result, statusForResult(result));
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
