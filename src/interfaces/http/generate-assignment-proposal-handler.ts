import type { GenerateAssignmentProposalResult } from "@/application/assignment-proposals";
import { operatorId, storyId, type OperatorActor } from "@/domain/editorial";
import { AssignmentEditorRuntimeConfigurationError, type AssignmentEditorRuntime } from "@/runtime";

import type { StoryRouteContext } from "./attach-source-to-story-handler";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

function status(result: GenerateAssignmentProposalResult): number {
  if (result.ok) return 201;
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

export function createGenerateAssignmentProposalHttpHandler(dependencies: {
  readonly getRuntime: () => AssignmentEditorRuntime;
  readonly environment?: NodeJS.ProcessEnv;
}) {
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
      const requestedBy: OperatorActor = {
        type: "operator",
        operatorId: operatorId(configuredOperator),
      };
      const parameters = await context.params;
      const result = await dependencies.getRuntime().generateAssignmentProposal({
        storyId: storyId(parameters.storyId),
        requestedBy,
      });
      return respond(result, status(result));
    } catch (caught) {
      if (caught instanceof AssignmentEditorRuntimeConfigurationError) {
        return respond(
          error("ASSIGNMENT_EDITOR_UNAVAILABLE", "Assignment Editor execution is not configured."),
          503,
        );
      }
      return respond(
        error("INTERNAL_SERVER_ERROR", "The Assignment Editor request could not be completed."),
        500,
      );
    }
  };
}
