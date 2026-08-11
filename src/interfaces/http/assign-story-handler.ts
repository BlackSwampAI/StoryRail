import type { AssignStoryResult } from "@/application/assignments";
import { agentProfileId, operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

interface Body {
  readonly writerProfileId: string;
  readonly angle: string;
  readonly brief: string;
  readonly constraints: string | null;
  readonly reason: string;
}

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

function isBody(value: unknown): value is Body {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).sort().join(",") === "angle,brief,constraints,reason,writerProfileId" &&
    typeof item.writerProfileId === "string" &&
    typeof item.angle === "string" &&
    typeof item.brief === "string" &&
    (item.constraints === null || typeof item.constraints === "string") &&
    typeof item.reason === "string"
  );
}

function status(result: AssignStoryResult): number {
  if (result.ok) return 201;
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
    case "AGENT_PROFILE_NOT_FOUND":
      return 404;
    case "INVALID_TRANSITION":
    case "STORY_ASSIGNMENT_CONFLICT":
      return 409;
    default:
      return 422;
  }
}

export function createAssignStoryHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}) {
  return async (request: Request, context: StoryRouteContext): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return json(
        error("UNSUPPORTED_MEDIA_TYPE", "The request Content-Type must be application/json."),
        415,
      );
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(error("INVALID_JSON", "The request body must contain valid JSON."), 400);
    }
    if (!isBody(body)) {
      return json(
        error(
          "INVALID_REQUEST",
          "The request body must contain exactly writerProfileId, angle, brief, constraints, and reason.",
        ),
        400,
      );
    }
    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured || configured.trim().length === 0) throw new Error("missing operator");
      const assignedBy: OperatorActor = { type: "operator", operatorId: operatorId(configured) };
      const parameters = await context.params;
      const result = await dependencies.getRuntime().assignStory({
        storyId: storyId(parameters.storyId),
        writerProfileId: agentProfileId(body.writerProfileId),
        angle: body.angle,
        brief: body.brief,
        constraints: body.constraints,
        reason: body.reason,
        assignedBy,
      });
      return json(result, status(result));
    } catch {
      return json(error("INTERNAL_SERVER_ERROR", "The Story request could not be completed."), 500);
    }
  };
}
