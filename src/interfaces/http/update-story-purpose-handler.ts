import { operatorId, storyId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers });

export function createUpdateStoryPurposeHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  return async (request: Request, context: StoryRouteContext): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return json(
        {
          ok: false,
          error: {
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "The request Content-Type must be application/json.",
          },
        },
        415,
      );
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(
        {
          ok: false,
          error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." },
        },
        400,
      );
    }
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).join(",") !== "purpose"
    )
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "The request body must contain exactly one purpose object.",
          },
        },
        400,
      );
    const purpose = (body as { purpose?: unknown }).purpose;
    if (typeof purpose !== "object" || purpose === null || Array.isArray(purpose))
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Purpose requires readerValue and focus text.",
          },
        },
        400,
      );
    const fields = purpose as Record<string, unknown>;
    if (
      Object.keys(fields).sort().join(",") !== "focus,readerValue" ||
      typeof fields.readerValue !== "string" ||
      typeof fields.focus !== "string"
    )
      return json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Purpose requires readerValue and focus text.",
          },
        },
        400,
      );
    const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
    if (!configured?.trim())
      return json(
        {
          ok: false,
          error: {
            code: "OPERATOR_ID_UNAVAILABLE",
            message: "Story purpose updates need an operator identity.",
          },
        },
        503,
      );
    try {
      const parameters = await context.params;
      const result = await dependencies.getRuntime().updateStoryPurpose({
        storyId: storyId(parameters.storyId),
        purpose: { readerValue: fields.readerValue, focus: fields.focus },
        updatedBy: { type: "operator", operatorId: operatorId(configured.trim()) },
      });
      if (result.ok) return json({ ok: true, story: result.story }, 200);
      const status =
        result.error.code === "STORY_NOT_FOUND"
          ? 404
          : result.error.code === "STORY_PURPOSE_INVALID"
            ? 422
            : 409;
      return json(result, status);
    } catch {
      return json(
        {
          ok: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The Story request could not be completed.",
          },
        },
        500,
      );
    }
  };
}
