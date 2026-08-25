import {
  AGENT_PROFILE_ROLES,
  type AgentProfile,
  type ModelDescriptor,
  type SiteId,
} from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const AGENT_PROFILE_REQUEST_UNAVAILABLE_MESSAGE =
  "The Agent Profile request could not be completed.";

export type AgentProfileClientResult<Value> =
  | { readonly kind: "completed"; readonly value: Value }
  | {
      readonly kind: "application-failure";
      readonly error: { readonly code: string; readonly message: string };
    }
  | {
      readonly kind: "unavailable";
      readonly message: typeof AGENT_PROFILE_REQUEST_UNAVAILABLE_MESSAGE;
    };

export interface AgentProfileClient {
  readonly listProfiles: () => Promise<AgentProfileClientResult<readonly AgentProfile[]>>;
  readonly createWriterProfile: (configuration: {
    readonly name: string;
    readonly instructions: string;
    readonly model: ModelDescriptor | null;
  }) => Promise<AgentProfileClientResult<AgentProfile>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isProfile(value: unknown): value is AgentProfile {
  if (
    !isRecord(value) ||
    !exact(value, ["id", "role", "name", "instructions", "model", "builtIn"])
  ) {
    return false;
  }
  const modelValid =
    value.model === null ||
    (isRecord(value.model) &&
      exact(value.model, ["provider", "model"]) &&
      typeof value.model.provider === "string" &&
      value.model.provider.trim().length > 0 &&
      value.model.provider === value.model.provider.trim() &&
      typeof value.model.model === "string" &&
      value.model.model.trim().length > 0 &&
      value.model.model === value.model.model.trim());
  return (
    typeof value.id === "string" &&
    typeof value.role === "string" &&
    (AGENT_PROFILE_ROLES as readonly string[]).includes(value.role) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name === value.name.trim() &&
    typeof value.instructions === "string" &&
    value.instructions.trim().length > 0 &&
    value.instructions === value.instructions.trim() &&
    modelValid &&
    typeof value.builtIn === "boolean" &&
    (value.builtIn || value.role === "writer")
  );
}

function unavailable(): AgentProfileClientResult<never> {
  return { kind: "unavailable", message: AGENT_PROFILE_REQUEST_UNAVAILABLE_MESSAGE };
}

async function parse<Value>(
  response: Response,
  status: number,
  key: "profiles" | "profile",
  valid: (value: unknown) => value is Value,
): Promise<AgentProfileClientResult<Value>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) return unavailable();
  if (response.status === status && body.ok === true && valid(body[key])) {
    return { kind: "completed", value: body[key] };
  }
  if (
    response.status >= 400 &&
    response.status < 500 &&
    body.ok === false &&
    isRecord(body.error) &&
    typeof body.error.code === "string" &&
    typeof body.error.message === "string"
  ) {
    return {
      kind: "application-failure",
      error: { code: body.error.code, message: body.error.message },
    };
  }
  return unavailable();
}

export function createAgentProfileClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): AgentProfileClient {
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  return {
    async listProfiles() {
      try {
        const response = await dependencies.fetch(api("/agent-profiles"), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        return await parse(
          response,
          200,
          "profiles",
          (value): value is readonly AgentProfile[] =>
            Array.isArray(value) && value.every(isProfile),
        );
      } catch {
        return unavailable();
      }
    },
    async createWriterProfile(configuration) {
      try {
        const response = await dependencies.fetch(api("/agent-profiles"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(configuration),
        });
        return await parse(response, 201, "profile", isProfile);
      } catch {
        return unavailable();
      }
    },
  };
}
