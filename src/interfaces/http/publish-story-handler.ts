import type { PublishStoryResult } from "@/application/story-publications";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function validBody(value: unknown): value is { readonly reason: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    Object.keys(value)[0] === "reason" &&
    typeof Reflect.get(value, "reason") === "string"
  );
}

function status(result: PublishStoryResult): number {
  if (result.ok) return 201;
  if (result.error.code === "STORY_NOT_FOUND") return 404;
  if (["INVALID_TRANSITION", "STORY_PUBLICATION_CONFLICT"].includes(result.error.code)) return 409;
  return 422;
}

export function createPublishStoryHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
}) {
  return async (request: Request, context: StoryRouteContext): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    )
      return respond(
        error("UNSUPPORTED_MEDIA_TYPE", "The request Content-Type must be application/json."),
        415,
      );

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return respond(error("INVALID_JSON", "The request body must contain valid JSON."), 400);
    }
    if (!validBody(body))
      return respond(
        error("INVALID_REQUEST", "The request body must contain exactly reason."),
        400,
      );

    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured?.trim()) throw new Error("missing operator");
      const publishedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const parameters = await context.params;
      const result = await dependencies.getRuntime().publishStory({
        storyId: storyId(parameters.storyId),
        reason: body.reason,
        publishedBy,
      });
      return respond(result, status(result));
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The Story could not be published."), 500);
    }
  };
}
