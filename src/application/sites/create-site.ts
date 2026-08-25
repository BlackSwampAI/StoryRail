import {
  BUILT_IN_AGENT_PROFILE_TEMPLATES,
  agentProfileId,
  canonicalizeSiteDomain,
  createAgentProfile,
  siteId,
  type AgentProfile,
  type Site,
  type SiteDomainValidationError,
} from "@/domain/editorial";

import type { CreateSiteResult, SiteRepository } from "./site-repository";

export interface CreateSiteCommand {
  readonly name: string;
  readonly domain: string;
  readonly description: string;
}

export interface SiteFieldRequiredError {
  readonly code: "SITE_NAME_REQUIRED" | "SITE_DESCRIPTION_REQUIRED";
  readonly message: string;
}

export type CreateSiteWorkflowResult =
  | CreateSiteResult
  | { readonly ok: false; readonly error: SiteFieldRequiredError | SiteDomainValidationError };

export type CreateSiteWorkflow = (command: CreateSiteCommand) => Promise<CreateSiteWorkflowResult>;

export interface CreateSiteDependencies {
  readonly sites: SiteRepository;
  readonly createUuid: () => string;
}

export function createCreateSite(dependencies: CreateSiteDependencies): CreateSiteWorkflow {
  return async (command) => {
    const name = typeof command.name === "string" ? command.name.trim() : "";
    if (name.length === 0) {
      return {
        ok: false,
        error: { code: "SITE_NAME_REQUIRED", message: "A Site name is required." },
      };
    }

    const description = typeof command.description === "string" ? command.description.trim() : "";
    if (description.length === 0) {
      return {
        ok: false,
        error: { code: "SITE_DESCRIPTION_REQUIRED", message: "A Site description is required." },
      };
    }

    const domain = canonicalizeSiteDomain(typeof command.domain === "string" ? command.domain : "");
    if (!domain.ok) {
      return { ok: false, error: domain.error };
    }

    const site: Site = {
      id: siteId(`site-${dependencies.createUuid()}`),
      name,
      domain: domain.domain,
      description,
    };

    // Profile identifiers are unique across the whole installation rather than within a Site, so
    // the built-ins cannot reuse the identifiers the migrations gave `site-default`. They are
    // minted fresh here and the Site's own listing orders them by role, which is what made those
    // identifiers meaningful in the first place.
    const builtInProfiles: AgentProfile[] = [];
    for (const template of BUILT_IN_AGENT_PROFILE_TEMPLATES) {
      const created = createAgentProfile({
        profileId: agentProfileId(dependencies.createUuid()),
        role: template.role,
        name: template.name,
        instructions: template.instructions,
        model: null,
        builtIn: true,
      });
      /* c8 ignore next 3 -- The templates are constants in the domain, so this cannot fail
         without the templates themselves being wrong, which their own test would catch. */
      if (!created.ok) {
        throw new Error(`The built-in ${template.role} Agent Profile is not valid.`);
      }
      builtInProfiles.push(created.profile);
    }

    // Newsroom standards are deliberately not seeded. `newsroom_standards` is empty on every
    // Site this installation has, including the one it started with, and the roles compose their
    // prompts with no standards in force when none are recorded. Writing a placeholder revision
    // would put words into a newsroom's mouth that no editor chose.
    return dependencies.sites.create(site, builtInProfiles);
  };
}
