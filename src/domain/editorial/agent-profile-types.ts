import type { ModelDescriptor } from "./source-evidence-preparation-types";
import type { AgentProfileId } from "./types";

export const AGENT_PROFILE_ROLES = [
  "assignment_editor",
  "researcher",
  "writer",
  "editor_in_chief",
] as const;

export type AgentProfileRole = (typeof AGENT_PROFILE_ROLES)[number];

export interface AgentProfile {
  readonly id: AgentProfileId;
  readonly role: AgentProfileRole;
  readonly name: string;
  readonly instructions: string;
  readonly model: ModelDescriptor | null;
  readonly builtIn: boolean;
}

export interface CreateAgentProfileCommand {
  readonly profileId: AgentProfileId;
  readonly role: unknown;
  readonly name: unknown;
  readonly instructions: unknown;
  readonly model: unknown;
  readonly builtIn: unknown;
}

export type AgentProfileValidationCode =
  | "AGENT_PROFILE_ROLE_UNSUPPORTED"
  | "AGENT_PROFILE_NAME_REQUIRED"
  | "AGENT_PROFILE_INSTRUCTIONS_REQUIRED"
  | "AGENT_PROFILE_MODEL_INVALID"
  | "AGENT_PROFILE_MODEL_PROVIDER_REQUIRED"
  | "AGENT_PROFILE_MODEL_IDENTIFIER_REQUIRED"
  | "AGENT_PROFILE_BUILT_IN_INVALID";

export interface AgentProfileValidationError {
  readonly code: AgentProfileValidationCode;
  readonly message: string;
}

export type CreateAgentProfileResult =
  | { readonly ok: true; readonly profile: AgentProfile }
  | { readonly ok: false; readonly error: AgentProfileValidationError };
