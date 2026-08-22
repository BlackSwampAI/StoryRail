import { after as scheduleAfterResponse } from "next/server";

import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import {
  AssignmentEditorRuntimeConfigurationError,
  DirectorRuntimeConfigurationError,
  StoryRuntimeConfigurationError,
  WriterRuntimeConfigurationError,
} from "@/runtime";

import {
  createAutopilot,
  type AutopilotRuntimes,
  type AutopilotStartFailure,
} from "./autopilot-sequence";
import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

/**
 * Autopilot fails fast on exactly the preconditions the Assignment Editor already enforces,
 * because that is the first step of the sequence and the only one the operator is waiting on.
 */
function status(result: AutopilotStartFailure): number {
  switch (result.error.code) {
    case "STORY_NOT_FOUND":
      return 404;
    case "ASSIGNMENT_PROPOSAL_NOT_ALLOWED":
    case "AGENT_RUN_ID_CONFLICT":
      return 409;
    case "ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED":
    case "WRITER_PROFILE_REQUIRED":
      return 422;
    case "ASSIGNMENT_EDITOR_PROFILE_UNAVAILABLE":
      return 500;
  }
}

export function createRunAutopilotHttpHandler(dependencies: {
  readonly getRuntimes: () => AutopilotRuntimes;
  readonly environment?: NodeJS.ProcessEnv;
  /** Injectable so the handler can be exercised outside a Next.js request scope. */
  readonly after?: (task: () => Promise<void>) => void;
}) {
  const after = dependencies.after ?? scheduleAfterResponse;
  return async (request: Request, context: StoryRouteContext): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return respond(
        error("UNSUPPORTED_MEDIA_TYPE", "The request Content-Type must be application/json."),
        415,
      );
    }
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
    ) {
      return respond(
        error("INVALID_REQUEST", "The request body must be exactly an empty object."),
        400,
      );
    }

    try {
      const configuredOperator = (dependencies.environment ?? process.env).STORYRAIL_OPERATOR_ID;
      if (!configuredOperator || configuredOperator.trim().length === 0) {
        throw new Error("missing operator");
      }
      // The operator authorised the run, so the operator remains the actor on every durable
      // record autopilot causes to be written. Autopilot is a policy, not an actor.
      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperator.trim()),
      };
      const parameters = await context.params;
      const started = await createAutopilot(dependencies.getRuntimes()).start({
        storyId: storyId(parameters.storyId),
        requestedBy,
      });
      if (!started.ok) return respond(started, status(started));

      // The first run is durable and its identity is returned now; the rest of the sequence
      // continues after the response, and every step of it is recorded by the workflow that
      // performs it. The caller follows the Story rather than this request.
      const { completion } = started;
      after(async () => {
        await completion;
      });
      return respond({ ok: true, runId: started.runId }, 202);
    } catch (caught) {
      if (
        caught instanceof AssignmentEditorRuntimeConfigurationError ||
        caught instanceof DirectorRuntimeConfigurationError ||
        caught instanceof WriterRuntimeConfigurationError ||
        caught instanceof StoryRuntimeConfigurationError
      ) {
        return respond(
          error("AUTOPILOT_UNAVAILABLE", "Autopilot execution is not configured."),
          503,
        );
      }
      return respond(
        error("INTERNAL_SERVER_ERROR", "The autopilot request could not be completed."),
        500,
      );
    }
  };
}
