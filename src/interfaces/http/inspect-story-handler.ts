import { storyId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

export interface InspectStoryHttpHandlerDependencies {
  readonly getRuntime: () => StoryRuntime;
}

export type InspectStoryHttpHandler = (
  request: Request,
  context: StoryRouteContext,
) => Promise<Response>;

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Story request could not be completed.",
  }),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_RESPONSE_HEADERS });
}

export function createInspectStoryHttpHandler(
  dependencies: InspectStoryHttpHandlerDependencies,
): InspectStoryHttpHandler {
  return async (_request, context) => {
    try {
      const routeParameters = await context.params;
      const result = await dependencies.getRuntime().inspectStory(storyId(routeParameters.storyId));
      return jsonResponse(result, result.ok ? 200 : 404);
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
