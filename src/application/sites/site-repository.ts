import type { AgentProfile, Site, SiteId } from "@/domain/editorial";

export interface SiteDomainTakenError {
  readonly code: "SITE_DOMAIN_TAKEN";
  readonly message: string;
  readonly domain: string;
}

export type CreateSiteResult =
  | { readonly ok: true; readonly site: Site }
  | { readonly ok: false; readonly error: SiteDomainTakenError };

export interface SiteRepository {
  findById(id: SiteId): Promise<Site | null>;
  list(): Promise<readonly Site[]>;
  /**
   * Write a Site together with the Agent Profiles that staff it, in one transaction.
   *
   * A Site whose built-in Profiles are missing is not a newsroom that half works; it is one where
   * the first assignment proposal fails. Writing them together means a partial failure leaves no
   * Site behind rather than an unusable one, and it is why this port takes the Profiles rather
   * than leaving a caller to remember a second write.
   */
  create(site: Site, builtInProfiles: readonly AgentProfile[]): Promise<CreateSiteResult>;
}
