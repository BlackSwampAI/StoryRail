import type { RecordStoryReviewDecisionResult } from "@/application/review-decisions";
import { agentRunId, operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
function validBody(
  value: unknown,
): value is { directorRunId: string; decision: "approve" | "request_changes"; reason: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    Object.keys(body).sort().join(",") === "decision,directorRunId,reason" &&
    typeof body.directorRunId === "string" &&
    (body.decision === "approve" || body.decision === "request_changes") &&
    typeof body.reason === "string"
  );
}
function status(result: RecordStoryReviewDecisionResult): number {
  if (result.ok) return 201;
  if (result.error.code === "STORY_NOT_FOUND") return 404;
  if (
    [
      "REVIEW_DECISION_NOT_ALLOWED",
      "DIRECTOR_REVIEW_REQUIRED",
      "DIRECTOR_REVIEW_MISMATCH",
      "REVIEW_DECISION_ALREADY_EXISTS",
      "REVIEW_DECISION_ID_CONFLICT",
      "REVIEW_DECISION_CONFLICT",
      "INVALID_TRANSITION",
      "REVISION_LIMIT_REACHED",
    ].includes(result.error.code)
  )
    return 409;
  return 422;
}

export function createRecordStoryReviewDecisionHttpHandler(dependencies: {
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
        error(
          "INVALID_REQUEST",
          "The request body must contain exactly directorRunId, decision, and reason.",
        ),
        400,
      );
    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured?.trim()) throw new Error("missing operator");
      const decidedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const parameters = await context.params;
      const result = await dependencies.getRuntime().recordStoryReviewDecision({
        storyId: storyId(parameters.storyId),
        directorRunId: agentRunId(body.directorRunId),
        decision: body.decision,
        reason: body.reason,
        decidedBy,
      });
      return respond(result, status(result));
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The review decision could not be completed."),
        500,
      );
    }
  };
}
