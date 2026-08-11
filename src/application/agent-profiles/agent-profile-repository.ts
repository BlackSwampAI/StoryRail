import type { AgentProfile, AgentProfileId } from "@/domain/editorial";

export interface AgentProfileIdConflictError {
  readonly code: "AGENT_PROFILE_ID_CONFLICT";
  readonly message: string;
  readonly profileId: AgentProfileId;
}

export type AppendAgentProfileResult =
  | { readonly ok: true; readonly profile: AgentProfile }
  | { readonly ok: false; readonly error: AgentProfileIdConflictError };

export interface AgentProfileRepository {
  append(profile: AgentProfile): Promise<AppendAgentProfileResult>;
  findById(profileId: AgentProfileId): Promise<AgentProfile | null>;
  list(): Promise<readonly AgentProfile[]>;
}
