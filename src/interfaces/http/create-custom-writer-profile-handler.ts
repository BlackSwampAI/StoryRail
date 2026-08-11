import type { CreateCustomWriterProfileResult } from "@/application/agent-profiles";
import type { ModelDescriptor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

export interface CreateCustomWriterProfileHttpRequestBody {
  readonly name: string;
  readonly instructions: string;
  readonly model: ModelDescriptor | null;
}

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const INVALID_JSON = {
  ok: false,
  error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." },
} as const;
const INVALID_REQUEST = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message:
      "The request body must contain exactly name, instructions, and a null or provider/model configuration.",
  },
} as const;
const UNSUPPORTED_MEDIA_TYPE = {
  ok: false,
  error: {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request Content-Type must be application/json.",
  },
} as const;
const INTERNAL_SERVER_ERROR = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "The Agent Profile request could not be completed.",
  },
} as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...expected].sort().join(",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBody(value: unknown): value is CreateCustomWriterProfileHttpRequestBody {
  if (!isRecord(value) || !exactKeys(value, ["name", "instructions", "model"])) return false;
  if (typeof value.name !== "string" || typeof value.instructions !== "string") return false;
  if (value.model === null) return true;
  return (
    isRecord(value.model) &&
    exactKeys(value.model, ["provider", "model"]) &&
    typeof value.model.provider === "string" &&
    typeof value.model.model === "string"
  );
}

function statusFor(result: CreateCustomWriterProfileResult): number {
  if (result.ok) return 201;
  return result.error.code === "AGENT_PROFILE_ID_CONFLICT" ? 409 : 422;
}

export function createCreateCustomWriterProfileHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (request: Request): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return json(UNSUPPORTED_MEDIA_TYPE, 415);
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(INVALID_JSON, 400);
    }
    if (!isBody(body)) return json(INVALID_REQUEST, 400);

    try {
      const result = await dependencies.getRuntime().createCustomWriterProfile(body);
      return json(result, statusFor(result));
    } catch {
      return json(INTERNAL_SERVER_ERROR, 500);
    }
  };
}
