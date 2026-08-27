import { isDeepStrictEqual } from "node:util";

import {
  agentProfileSchema,
  createAgentProfile,
  type AgentProfile,
  type AgentProfileRole,
} from "@/domain/editorial";

interface AgentProfilePersistenceRow {
  readonly profile_id: unknown;
  readonly role: unknown;
  readonly built_in: unknown;
  readonly payload: unknown;
}

export class PostgresAgentProfileInvariantError extends Error {
  constructor() {
    super("PostgreSQL Agent Profile persistence returned an invalid or impossible result.");
    this.name = "PostgresAgentProfileInvariantError";
  }
}

export function decodePostgresAgentProfile(row: AgentProfilePersistenceRow): AgentProfile {
  const parsed = agentProfileSchema.safeParse(row.payload);
  if (
    typeof row.profile_id !== "string" ||
    typeof row.role !== "string" ||
    typeof row.built_in !== "boolean" ||
    !parsed.success
  ) {
    throw new PostgresAgentProfileInvariantError();
  }

  const payload = parsed.data;
  const decoded = createAgentProfile({
    profileId: row.profile_id as AgentProfile["id"],
    role: payload.role,
    name: payload.name,
    instructions: payload.instructions,
    model: payload.model,
    builtIn: payload.builtIn,
  });

  if (
    !decoded.ok ||
    payload.id !== row.profile_id ||
    decoded.profile.role !== (row.role as AgentProfileRole) ||
    decoded.profile.builtIn !== row.built_in ||
    !isDeepStrictEqual(decoded.profile, payload)
  ) {
    throw new PostgresAgentProfileInvariantError();
  }

  return structuredClone(decoded.profile);
}
