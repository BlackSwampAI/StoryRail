import { siteId, type SiteId } from "@/domain/editorial";

/**
 * The Site every installation starts with. It is created by migration, so a fresh install always
 * has one Site to land on even before an operator has created any of their own.
 */
export const DEFAULT_SITE_ID = siteId("site-default");

/**
 * Which Site the bare `/` sends an operator to, and nothing more.
 *
 * The Site a request belongs to now comes from the URL path, because two tabs must be able to
 * show two newsrooms and a shared link has to carry its tenant with it. `STORYRAIL_SITE_ID`
 * survives only as the landing choice for an installation whose operators bookmarked `/` before
 * Sites could be switched; it no longer selects the tenant any request is served as.
 */
export function resolveLandingSiteId(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): SiteId {
  const configured = environment.STORYRAIL_SITE_ID?.trim();
  return configured ? siteId(configured) : DEFAULT_SITE_ID;
}
