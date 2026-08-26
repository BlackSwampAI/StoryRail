import { z } from "zod";

import { TOOL_FAILURE_CODES, recordAgentToolCall, type AgentToolCall } from "@/domain/editorial";

export class PostgresAgentToolCallInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted tool call.");
    this.name = "PostgresAgentToolCallInvariantError";
  }
}

const nonEmpty = z.string().refine((value) => value.trim().length > 0);
const callSchema = z
  .object({
    id: nonEmpty,
    runId: nonEmpty,
    storyId: nonEmpty,
    sequence: z.number().int().min(1),
    tool: nonEmpty,
    request: z.record(z.string(), z.unknown()),
    requestedAt: nonEmpty,
  })
  .and(
    z.union([
      z.object({ outcome: z.literal("running"), completedAt: z.null() }),
      z.object({ outcome: z.literal("succeeded"), completedAt: nonEmpty, result: z.unknown() }),
      z.object({
        outcome: z.literal("failed"),
        completedAt: nonEmpty,
        failure: z
          .object({
            code: z.enum(TOOL_FAILURE_CODES),
            retryable: z.boolean(),
            message: nonEmpty.nullable(),
          })
          .strict(),
      }),
    ]),
  );

/**
 * One decoder for every read of a persisted tool call.
 *
 * Story inspection reads the same rows the tool call repository writes, and a second decoder
 * written beside it would be a second opinion on what a valid record is — the drift that made a
 * correctly recorded agent run unreadable to the browser.
 */
export function decodePostgresAgentToolCall(
  payload: unknown,
  invariantError: () => Error = () => new PostgresAgentToolCallInvariantError(),
): AgentToolCall {
  const parsed = callSchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  const recorded = recordAgentToolCall(parsed.data as unknown as AgentToolCall);
  if (!recorded.ok) throw invariantError();
  return recorded.call;
}
