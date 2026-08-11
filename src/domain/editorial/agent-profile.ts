import {
  AGENT_PROFILE_ROLES,
  type AgentProfileRole,
  type AgentProfileValidationCode,
  type CreateAgentProfileCommand,
  type CreateAgentProfileResult,
} from "./agent-profile-types";
import type { ModelDescriptor } from "./source-evidence-preparation-types";

function invalid(code: AgentProfileValidationCode, message: string): CreateAgentProfileResult {
  return { ok: false, error: { code, message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProfileRole(value: unknown): value is AgentProfileRole {
  return typeof value === "string" && (AGENT_PROFILE_ROLES as readonly string[]).includes(value);
}

export function createAgentProfile(command: CreateAgentProfileCommand): CreateAgentProfileResult {
  if (!isProfileRole(command.role)) {
    return invalid("AGENT_PROFILE_ROLE_UNSUPPORTED", "The Agent Profile role is not supported.");
  }
  if (typeof command.name !== "string" || command.name.trim().length === 0) {
    return invalid("AGENT_PROFILE_NAME_REQUIRED", "A non-empty Agent Profile name is required.");
  }
  if (typeof command.instructions !== "string" || command.instructions.trim().length === 0) {
    return invalid(
      "AGENT_PROFILE_INSTRUCTIONS_REQUIRED",
      "Non-empty Agent Profile instructions are required.",
    );
  }
  if (typeof command.builtIn !== "boolean") {
    return invalid(
      "AGENT_PROFILE_BUILT_IN_INVALID",
      "Agent Profile built-in state must be a boolean.",
    );
  }

  let model: ModelDescriptor | null = null;
  if (command.model !== null) {
    if (
      !isRecord(command.model) ||
      Object.keys(command.model).sort().join(",") !== "model,provider"
    ) {
      return invalid(
        "AGENT_PROFILE_MODEL_INVALID",
        "Agent Profile model configuration must contain exactly provider and model.",
      );
    }
    if (typeof command.model.provider !== "string" || command.model.provider.trim().length === 0) {
      return invalid(
        "AGENT_PROFILE_MODEL_PROVIDER_REQUIRED",
        "A non-empty model provider is required when a model is configured.",
      );
    }
    if (typeof command.model.model !== "string" || command.model.model.trim().length === 0) {
      return invalid(
        "AGENT_PROFILE_MODEL_IDENTIFIER_REQUIRED",
        "A non-empty model identifier is required when a model is configured.",
      );
    }
    model = {
      provider: command.model.provider.trim(),
      model: command.model.model.trim(),
    };
  }

  return {
    ok: true,
    profile: {
      id: command.profileId,
      role: command.role,
      name: command.name.trim(),
      instructions: command.instructions.trim(),
      model,
      builtIn: command.builtIn,
    },
  };
}
