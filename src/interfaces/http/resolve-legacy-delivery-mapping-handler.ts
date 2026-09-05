import type { ResolveLegacyDeliveryMappingResult } from "@/application/story-deliveries";
import { operatorId, storyDeliveryId, storyId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function validBody(
  value: unknown,
): value is { readonly legacyDeliveryId: string; readonly decision: "confirm" | "dismiss" } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return (
    Object.keys(body).sort().join(",") === "decision,legacyDeliveryId" &&
    typeof body.legacyDeliveryId === "string" &&
    body.legacyDeliveryId.trim().length > 0 &&
    (body.decision === "confirm" || body.decision === "dismiss")
  );
}

function status(result: ResolveLegacyDeliveryMappingResult): number {
  if (result.ok) return 201;
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
    case "LEGACY_DELIVERY_MAPPING_NOT_FOUND":
      return 404;
    case "LEGACY_DELIVERY_MAPPING_STALE":
    case "LEGACY_DELIVERY_MAPPING_DESTINATION_MISMATCH":
    case "LEGACY_DELIVERY_MAPPING_RESOLUTION_ID_CONFLICT":
      return 409;
    case "DESTINATION_NOT_CONFIGURED":
    case "CREDENTIAL_NOT_CONFIGURED":
    case "CREDENTIAL_KEY_UNAVAILABLE":
    case "CREDENTIAL_UNREADABLE":
    case "OPENROUTER_API_KEY_REQUIRED":
    case "FIRECRAWL_API_KEY_REQUIRED":
      return 503;
    case "LEGACY_DELIVERY_MAPPING_RESOLUTION_INVALID":
    case "LEGACY_DELIVERY_MAPPING_RESOLUTION_NOT_RECORDED":
      return 500;
  }
}

export function createResolveLegacyDeliveryMappingHttpHandler(dependencies: {
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
          "The request body must contain exactly legacyDeliveryId and decision.",
        ),
        400,
      );

    const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
    if (!configured?.trim())
      return respond(
        error("OPERATOR_NOT_CONFIGURED", "No StoryRail operator identity is configured."),
        503,
      );

    try {
      const decidedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const parameters = await context.params;
      const result = await dependencies.getRuntime().resolveLegacyDeliveryMapping({
        storyId: storyId(parameters.storyId),
        legacyDeliveryId: storyDeliveryId(body.legacyDeliveryId.trim()),
        decision: body.decision,
        decidedBy,
      });
      return respond(result, status(result));
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The legacy delivery mapping could not be resolved."),
        500,
      );
    }
  };
}
