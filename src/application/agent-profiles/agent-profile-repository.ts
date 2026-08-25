import type { AgentProfile, AgentProfileId, AgentProfileRole } from "@/domain/editorial";

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
  /**
   * This Site's built-in Profile for a role.
   *
   * The four built-ins used to be found by the identifier the migration gave them, which was
   * sound while one Site had every Profile. Profile identifiers are unique across the whole
   * installation, so a Site created from the product mints its own and could never answer to
   * that identifier — a newsroom's Assignment Editor is the one on its own staff, not one
   * particular row in the table.
   */
  findBuiltIn(role: AgentProfileRole): Promise<AgentProfile | null>;
  list(): Promise<readonly AgentProfile[]>;
}
