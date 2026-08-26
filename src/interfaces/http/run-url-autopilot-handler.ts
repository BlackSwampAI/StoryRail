import { randomUUID } from "node:crypto";

import { after as scheduleAfterResponse } from "next/server";

import { isCredentialUnavailableError, operatorId, policyRunId } from "@/domain/editorial";
import type { OperatorActor } from "@/domain/editorial";
import {
  AssignmentEditorRuntimeConfigurationError,
  DirectorRuntimeConfigurationError,
  StoryRuntimeConfigurationError,
  WriterRuntimeConfigurationError,
} from "@/runtime";

import { createAutopilot, type AutopilotRuntimes } from "./autopilot-sequence";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });
const error = (code: string, message: string) => ({ ok: false, error: { code, message } });

/** The URL itself was unusable, so an operator can fix it and try again with a corrected one. */
const URL_VALIDATION_CODES = new Set([
  "SOURCE_URL_REQUIRED",
  "SOURCE_URL_TOO_LONG",
  "INVALID_SOURCE_URL",
  "UNSUPPORTED_SOURCE_PROTOCOL",
  "SOURCE_URL_CREDENTIALS_NOT_ALLOWED",
]);

function isBody(value: unknown): value is {
  readonly submittedUrl: string;
  readonly research?: boolean;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).every((key) => key === "submittedUrl" || key === "research") &&
    typeof record.submittedUrl === "string" &&
    (!("research" in record) || typeof record.research === "boolean")
  );
}

/**
 * Starts a whole autopilot run from a URL, and answers as soon as intake is durable.
 *
 * Intake is the only part an operator waits on, because it is the only part whose refusal they
 * can act on: a malformed URL, a page this newsroom has already ingested, an extractor with no
 * key. Everything after it is minutes of model work, is recorded step by step by the workflow
 * that performs it, and is followed through the policy run this returns rather than this request.
 */
export function createRunUrlAutopilotHttpHandler(dependencies: {
  readonly getRuntimes: () => AutopilotRuntimes;
  readonly environment?: NodeJS.ProcessEnv;
  /** Injectable so the handler can be exercised outside a Next.js request scope. */
  readonly after?: (task: () => Promise<void>) => void;
}) {
  const after = dependencies.after ?? scheduleAfterResponse;
  return async (request: Request): Promise<Response> => {
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
    if (!isBody(body)) {
      return respond(
        error(
          "INVALID_REQUEST",
          "The request body must contain a string submittedUrl and, at most, a boolean research flag.",
        ),
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
      const started = await createAutopilot(dependencies.getRuntimes()).startFromUrl({
        submittedUrl: body.submittedUrl,
        requestedBy,
        research: body.research === true,
        createPolicyRunId: () => policyRunId(randomUUID()),
      });
      if (!started.ok) {
        const status =
          started.stage === "policy"
            ? 409
            : started.stage === "extraction"
              ? // Nothing was extracted, so a missing key is not a server fault. The model routes
                // answer 503 for the same condition and a client must not have to special-case
                // which route reported it.
                isCredentialUnavailableError(started.error)
                ? 503
                : 500
              : URL_VALIDATION_CODES.has(started.error.code)
                ? 422
                : 409;
        return respond({ ok: false, error: started.error }, status);
      }

      const { completion } = started;
      after(async () => {
        await completion;
      });
      return respond(
        { ok: true, policyRunId: started.policyRunId, sourceId: started.source.id },
        202,
      );
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
