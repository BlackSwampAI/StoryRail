import { after as scheduleAfterResponse } from "next/server";

import type { RunDirectorReviewFailure } from "@/application/director-reviews";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import { DirectorRuntimeConfigurationError, type DirectorRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
function status(result: RunDirectorReviewFailure): number {
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
      return 404;
    case "DIRECTOR_REVIEW_NOT_ALLOWED":
    case "DIRECTOR_REVIEW_ALREADY_SUCCEEDED":
    case "AGENT_RUN_ID_CONFLICT":
      return 409;
    case "DIRECTOR_EVIDENCE_UNAVAILABLE":
    case "ASSIGNMENT_REQUIRED":
    case "ARTICLE_REQUIRED":
    case "ARTICLE_REVISION_REQUIRED":
      return 422;
    case "DIRECTOR_MODEL_UNAVAILABLE":
      return 503;
    case "DIRECTOR_PROFILE_UNAVAILABLE":
    case "DIRECTOR_MODEL_UNSUPPORTED":
      return 500;
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

export function createRunDirectorReviewHttpHandler(dependencies: {
  readonly getRuntime: () => DirectorRuntime;
  readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
  /** Injectable so the handler can be exercised outside a Next.js request scope. */
  readonly after?: (task: () => Promise<void>) => void;
}) {
  const after = dependencies.after ?? scheduleAfterResponse;
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
      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const parameters = await context.params;
      const started = await dependencies
        .getRuntime()
        .runDirectorReview({ storyId: storyId(parameters.storyId), requestedBy });
      if (!started.ok) return respond(started, status(started));

      // The run is durable and its identity is returned now; the model call finishes after
      // the response so a slow provider cannot hold the request open.
      const { completion } = started;
      after(async () => {
        await completion;
      });
      return respond({ ok: true, runId: started.runId }, 202);
    } catch (caught) {
      if (caught instanceof DirectorRuntimeConfigurationError)
        return respond(error("DIRECTOR_UNAVAILABLE", "Director execution is not configured."), 503);
      return respond(
        error("INTERNAL_SERVER_ERROR", "The Director request could not be completed."),
        500,
      );
    }
  };
}
