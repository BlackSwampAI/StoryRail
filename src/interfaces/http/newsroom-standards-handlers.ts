import { operatorId, type OperatorActor } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

export function createListNewsroomStandardsHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (): Promise<Response> => {
    try {
      const history = await dependencies.getRuntime().listNewsroomStandards();
      // The whole history, so a past run can be explained by what was current when it ran.
      return respond({ ok: true, standards: history }, 200);
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The newsroom standards could not be read."),
        500,
      );
    }
  };
}

export function createSetNewsroomStandardsHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
  readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
}) {
  return async (request: Request): Promise<Response> => {
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
      Object.keys(body).length !== 1 ||
      typeof (body as { text: unknown }).text !== "string"
    )
      return respond(error("INVALID_REQUEST", "The request body must contain exactly text."), 400);

    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured?.trim()) throw new Error("missing operator");
      const updatedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const result = await dependencies
        .getRuntime()
        .setNewsroomStandards({ text: (body as { text: string }).text, updatedBy });
      return respond(result, result.ok ? 201 : 422);
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The newsroom standards could not be saved."),
        500,
      );
    }
  };
}
