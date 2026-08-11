import {
  createAgentProfile,
  type AgentProfile,
  type AgentProfileId,
  type AgentProfileValidationError,
  type ModelDescriptor,
} from "@/domain/editorial";

import type {
  AgentProfileIdConflictError,
  AgentProfileRepository,
} from "./agent-profile-repository";

export interface CreateCustomWriterProfileCommand {
  readonly name: string;
  readonly instructions: string;
  readonly model: ModelDescriptor | null;
}

export interface CreateCustomWriterProfileDependencies {
  readonly repository: AgentProfileRepository;
  readonly createAgentProfileId: () => AgentProfileId;
}

export type CreateCustomWriterProfileResult =
  | { readonly ok: true; readonly profile: AgentProfile }
  | {
      readonly ok: false;
      readonly error: AgentProfileValidationError | AgentProfileIdConflictError;
    };

export type CreateCustomWriterProfileWorkflow = (
  command: CreateCustomWriterProfileCommand,
) => Promise<CreateCustomWriterProfileResult>;

export function createCreateCustomWriterProfile(
  dependencies: CreateCustomWriterProfileDependencies,
): CreateCustomWriterProfileWorkflow {
  return async (command) => {
    const result = createAgentProfile({
      profileId: dependencies.createAgentProfileId(),
      role: "writer",
      name: command.name,
      instructions: command.instructions,
      model: command.model,
      builtIn: false,
    });

    if (!result.ok) return result;
    return dependencies.repository.append(result.profile);
  };
}
