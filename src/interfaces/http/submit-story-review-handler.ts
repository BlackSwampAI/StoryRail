import type { SubmitStoryReviewResult } from "@/application/review-submissions";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
function status(result: SubmitStoryReviewResult): number {
  if (result.ok) return 201;
  if (result.error.code === "STORY_NOT_FOUND") return 404;
  if (
    ["REVIEW_SUBMISSION_NOT_ALLOWED", "REVIEW_SUBMISSION_CONFLICT", "INVALID_TRANSITION"].includes(
      result.error.code,
    )
  )
    return 409;
  return 422;
}

export function createSubmitStoryReviewHttpHandler(dependencies: {
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
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      Object.keys(body).length !== 0
    )
      return respond(
        error("INVALID_REQUEST", "The request body must be exactly an empty object."),
        400,
      );
    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured?.trim()) throw new Error("missing operator");
      const submittedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const parameters = await context.params;
      const result = await dependencies
        .getRuntime()
        .submitStoryReview({ storyId: storyId(parameters.storyId), submittedBy });
      return respond(result, status(result));
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The review submission could not be completed."),
        500,
      );
    }
  };
}
