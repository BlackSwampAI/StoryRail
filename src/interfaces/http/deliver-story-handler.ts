import type { DeliverStoryResult } from "@/application/story-deliveries";
import { storyId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function status(result: DeliverStoryResult): number {
  if (result.ok) return 201;
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
      return 404;
    case "STORY_NOT_PUBLISHED":
    case "STORY_HAS_NO_ARTICLE":
    case "DESTINATION_MAPPING_REQUIRES_REVIEW":
    case "DESTINATION_RECONCILIATION_REQUIRED":
      return 409;
    case "STORY_DELIVERY_NOT_RECORDED":
      return 500;
    // Nothing was attempted and no delivery was recorded, because the newsroom cannot attempt
    // one until an operator configures the destination or restores the key it was written with.
    case "DESTINATION_NOT_CONFIGURED":
    case "CREDENTIAL_NOT_CONFIGURED":
    case "CREDENTIAL_KEY_UNAVAILABLE":
    case "CREDENTIAL_UNREADABLE":
    case "OPENROUTER_API_KEY_REQUIRED":
    case "FIRECRAWL_API_KEY_REQUIRED":
      return 503;
    // The delivery was attempted, recorded, and refused. It is answered as a gateway failure
    // rather than a client error, because nothing about the request an operator made was wrong.
    case "DESTINATION_UNREACHABLE":
    case "DESTINATION_REJECTED":
    case "DESTINATION_UNAUTHORIZED":
    case "DESTINATION_RESPONSE_INVALID":
      return 502;
  }
}

/**
 * Asks for one delivery of a published Story. There is no body to it: what is delivered is the
 * latest Revision and where it goes is the Site's configured destination, so a caller has
 * nothing to choose and therefore nothing to get wrong.
 */
export function createDeliverStoryHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
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
    if (typeof body !== "object" || body === null || Object.keys(body).length !== 0)
      return respond(
        error("INVALID_REQUEST", "The request body must be an empty JSON object."),
        400,
      );

    try {
      const parameters = await context.params;
      const result = await dependencies
        .getRuntime()
        .deliverStory({ storyId: storyId(parameters.storyId) });
      return respond(result, status(result));
    } catch {
      return respond(error("INTERNAL_SERVER_ERROR", "The delivery could not be completed."), 500);
    }
  };
}
