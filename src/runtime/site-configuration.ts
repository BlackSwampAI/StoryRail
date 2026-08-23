import { siteId, type SiteId } from "@/domain/editorial";

/**
 * The Site every installation starts with. It is created by migration and is the only Site that
 * exists until Sites can be created, so an unset variable is an ordinary single-site install
 * rather than a misconfiguration worth refusing to start over.
 */
export const DEFAULT_SITE_ID = siteId("site-default");

/**
 * The one place a request or a run learns which Site it belongs to.
 *
 * Every runtime resolves the Site here and hands it to the repositories it builds. Nothing below
 * a composition root reads the environment, so no handler can quietly pick a different Site than
 * the repositories it is about to call were scoped to.
 */
export function resolveSiteId(
  environment: Readonly<Partial<NodeJS.ProcessEnv>> = process.env,
): SiteId {
  const configured = environment.STORYRAIL_SITE_ID?.trim();
  return configured ? siteId(configured) : DEFAULT_SITE_ID;
}
