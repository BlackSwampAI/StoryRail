import { after as scheduleAfterResponse } from "next/server";

import type { ResearchStorySourcesFailure } from "@/application/source-research";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import { ResearcherRuntimeConfigurationError, type ResearcherRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function status(result: ResearchStorySourcesFailure): number {
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
      return 404;
    case "SOURCE_RESEARCH_NOT_ALLOWED":
    case "AGENT_RUN_ID_CONFLICT":
      return 409;
    case "RESEARCH_EVIDENCE_REQUIRED":
      return 422;
    case "RESEARCHER_PROFILE_UNAVAILABLE":
    case "RESEARCHER_MODEL_UNAVAILABLE":
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

export function createResearchStorySourcesHttpHandler(dependencies: {
  readonly getRuntime: () => ResearcherRuntime;
  readonly environment?: NodeJS.ProcessEnv;
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
      const started = await dependencies.getRuntime().researchStorySources({
        storyId: storyId(parameters.storyId),
        requestedBy,
      });
      if (!started.ok) return respond(started, status(started));

      // Retrieval takes as long as the pages do. The run is durable and its identity is
      // returned now; the operator follows the Story rather than this request.
      const { completion } = started;
      after(async () => {
        await completion;
      });
      return respond({ ok: true, runId: started.runId }, 202);
    } catch (caught) {
      if (caught instanceof ResearcherRuntimeConfigurationError)
        return respond(error("RESEARCH_UNAVAILABLE", "Research is not configured."), 503);
      return respond(
        error("INTERNAL_SERVER_ERROR", "The research request could not be completed."),
        500,
      );
    }
  };
}
