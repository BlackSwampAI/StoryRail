import { agentToolCallSchema, recordAgentToolCall, type AgentToolCall } from "@/domain/editorial";

export class PostgresAgentToolCallInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted tool call.");
    this.name = "PostgresAgentToolCallInvariantError";
  }
}

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
  const parsed = agentToolCallSchema.safeParse(payload);
  if (!parsed.success) throw invariantError();
  const recorded = recordAgentToolCall(parsed.data as unknown as AgentToolCall);
  if (!recorded.ok) throw invariantError();
  return recorded.call;
}
