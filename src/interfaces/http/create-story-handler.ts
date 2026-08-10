import type { CreateStoryWorkflowResult } from "@/application/story-creation";
import type { StoryRuntime } from "@/runtime";

export interface CreateStoryHttpRequestBody {
  readonly title: string;
}

export interface CreateStoryHttpHandlerDependencies {
  readonly getRuntime: () => StoryRuntime;
}

export type CreateStoryHttpHandler = (request: Request) => Promise<Response>;

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

function isRequestBody(value: unknown): value is CreateStoryHttpRequestBody {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);
  return (
    keys.length === 1 &&
    keys[0] === "title" &&
    Object.prototype.hasOwnProperty.call(value, "title") &&
    typeof (value as Record<string, unknown>).title === "string"
  );
}

function statusForResult(result: CreateStoryWorkflowResult): number {
  if (result.ok) {
    return 201;
  }

  return result.error.code === "STORY_TITLE_REQUIRED" ? 422 : 409;
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
    message: "The request body must contain exactly one string property named title.",
  }),
});

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Story request could not be completed.",
  }),
});

export function createCreateStoryHttpHandler(
  dependencies: CreateStoryHttpHandlerDependencies,
): CreateStoryHttpHandler {
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
      const result = await dependencies.getRuntime().createStory({ title: body.title });
      return jsonResponse(result, statusForResult(result));
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
