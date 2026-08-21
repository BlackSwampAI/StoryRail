import { after as scheduleAfterResponse } from "next/server";

import type { CreateWriterDraftFailure } from "@/application/writer-drafts";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import { WriterRuntimeConfigurationError, type WriterRuntime } from "@/runtime";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });
function status(result: CreateWriterDraftFailure): number {
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
      return 404;
    case "WRITER_DRAFT_NOT_ALLOWED":
    case "ASSIGNMENT_REQUIRED":
    case "ARTICLE_ALREADY_EXISTS":
    case "WRITER_DRAFT_CONFLICT":
    case "AGENT_RUN_ID_CONFLICT":
      return 409;
    case "WRITER_EVIDENCE_REQUIRED":
      return 422;
    case "WRITER_MODEL_UNAVAILABLE":
      return 503;
    case "WRITER_MODEL_UNSUPPORTED":
    case "WRITER_PROFILE_UNAVAILABLE":
      return 500;
  }
}

export function createWriterDraftHttpHandler(dependencies: {
  readonly getRuntime: () => WriterRuntime;
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
      const configuredOperator = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configuredOperator?.trim()) throw new Error("missing operator");
      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperator),
      };
      const parameters = await context.params;
      const started = await dependencies
        .getRuntime()
        .createWriterDraft({ storyId: storyId(parameters.storyId), requestedBy });
      if (!started.ok) return respond(started, status(started));

      // The run is durable and its identity is returned now; the model call finishes after
      // the response so a slow provider cannot hold the request open.
      const { completion } = started;
      after(async () => {
        await completion;
      });
      return respond({ ok: true, runId: started.runId }, 202);
    } catch (caught) {
      if (caught instanceof WriterRuntimeConfigurationError)
        return respond(error("WRITER_UNAVAILABLE", "Writer execution is not configured."), 503);
      return respond(
        error("INTERNAL_SERVER_ERROR", "The Writer request could not be completed."),
        500,
      );
    }
  };
}
