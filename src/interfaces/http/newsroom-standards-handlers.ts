import {
  MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS,
  operatorId,
  type OperatorActor,
  type PublicationBrief,
} from "@/domain/editorial";
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
    if (typeof body !== "object" || body === null || Array.isArray(body))
      return respond(
        error("INVALID_REQUEST", "The request body must contain text and an optional brief."),
        400,
      );
    const fields = body as Record<string, unknown>;
    if (
      (Object.keys(fields).sort().join(",") !== "text" &&
        Object.keys(fields).sort().join(",") !== "brief,text") ||
      typeof fields.text !== "string"
    )
      return respond(
        error("INVALID_REQUEST", "The request body must contain text and an optional brief."),
        400,
      );
    let brief: PublicationBrief | undefined;
    if (fields.brief !== undefined) {
      if (typeof fields.brief !== "object" || fields.brief === null || Array.isArray(fields.brief))
        return respond(
          error("INVALID_REQUEST", "The publication brief has an invalid shape."),
          400,
        );
      const candidate = fields.brief as Record<string, unknown>;
      const keys = ["audience", "readerBenefit", "coverageCriteria", "voice", "avoid"];
      if (
        Object.keys(candidate).sort().join(",") !== [...keys].sort().join(",") ||
        keys.some(
          (key) =>
            typeof candidate[key] !== "string" ||
            (candidate[key] as string).length > MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS,
        )
      )
        return respond(
          error(
            "INVALID_REQUEST",
            "The publication brief has an invalid shape or fields exceed 2,000 characters.",
          ),
          400,
        );
      brief = candidate as unknown as PublicationBrief;
    }

    try {
      const configured = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configured?.trim()) throw new Error("missing operator");
      const updatedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configured.trim()),
      };
      const result = await dependencies
        .getRuntime()
        .setNewsroomStandards({ text: fields.text, ...(brief ? { brief } : {}), updatedBy });
      return respond(result, result.ok ? 201 : 422);
    } catch {
      return respond(
        error("INTERNAL_SERVER_ERROR", "The newsroom standards could not be saved."),
        500,
      );
    }
  };
}
