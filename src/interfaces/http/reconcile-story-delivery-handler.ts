import type { ReconcileStoryDeliveryResult } from "@/application/story-deliveries";
import {
  operatorId,
  storyDeliveryId,
  storyId,
  type OperatorActor,
  type StoryDeliveryReconciliationDecision,
} from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

type Body = {
  readonly deliveryId: string;
  readonly decision: StoryDeliveryReconciliationDecision;
  readonly remoteId: string | null;
};

function validBody(value: unknown): value is Body {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).sort().join(",") !== "decision,deliveryId,remoteId") return false;
  if (typeof body.deliveryId !== "string" || body.deliveryId.trim().length === 0) return false;
  if (body.decision === "delivered")
    return typeof body.remoteId === "string" && body.remoteId.trim().length > 0;
  return body.decision === "not_delivered" && body.remoteId === null;
}

function status(result: ReconcileStoryDeliveryResult): number {
  if (result.ok) return 201;
  switch (result.error.code) {
    case "STORY_DELIVERY_RECONCILIATION_NOT_FOUND":
    case "STORY_NOT_FOUND":
      return 404;
    case "STORY_DELIVERY_ALREADY_RECONCILED":
      return 409;
    case "STORY_DELIVERY_RECONCILIATION_INVALID":
      return 400;
    case "DESTINATION_NOT_CONFIGURED":
    case "CREDENTIAL_NOT_CONFIGURED":
    case "CREDENTIAL_KEY_UNAVAILABLE":
    case "CREDENTIAL_UNREADABLE":
    case "OPENROUTER_API_KEY_REQUIRED":
    case "FIRECRAWL_API_KEY_REQUIRED":
      return 503;
    case "STORY_DELIVERY_RECONCILIATION_NOT_RECORDED":
      return 500;
  }
}

export function createReconcileStoryDeliveryHttpHandler(dependencies: {
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
          "The request body must contain exactly deliveryId, decision, and remoteId.",
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
      const result = await dependencies.getRuntime().reconcileStoryDelivery({
        storyId: storyId(parameters.storyId),
        deliveryId: storyDeliveryId(body.deliveryId.trim()),
        decision: body.decision,
        remoteId: typeof body.remoteId === "string" ? body.remoteId.trim() : null,
        decidedBy,
      });
      return respond(result, status(result));
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The delivery reconciliation could not be recorded."),
        500,
      );
    }
  };
}
