import type { SiteId } from "@/domain/editorial";

/**
 * Every path the browser asks for, built from the Site the operator is looking at.
 *
 * There are ten fetch call sites across the newsroom and a hardcoded `/api/...` in any one of
 * them is a request that quietly reads or writes another tenant's newsroom. Routing them all
 * through here means a new call site cannot be written without naming a Site.
 */
export function siteApiPath(site: SiteId, suffix: string): string {
  return `/api/sites/${encodeURIComponent(site)}${suffix}`;
}

/** The page an operator lands on for a Site, and what the switcher navigates to. */
export function sitePagePath(site: SiteId): string {
  return `/s/${encodeURIComponent(site)}`;
}
