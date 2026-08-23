import type { SiteId } from "./types";

/**
 * One website this installation publishes, and the boundary everything editorial sits inside.
 *
 * A Site is a tenant, not a setting. Stories, Sources, newsroom standards, and Agent Profiles
 * each belong to exactly one, and nothing an agent or an operator does on one Site can reach
 * another's work.
 */
export interface Site {
  readonly id: SiteId;
  readonly name: string;
  readonly domain: string;
  readonly description: string;
}
