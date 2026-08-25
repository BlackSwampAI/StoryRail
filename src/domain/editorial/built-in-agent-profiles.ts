import type { AgentProfileRole } from "./agent-profile-types";

export interface BuiltInAgentProfileTemplate {
  readonly role: AgentProfileRole;
  readonly name: string;
  readonly instructions: string;
}

/**
 * The four Agent Profiles a newsroom cannot work without, in the order the newsroom works.
 *
 * These were previously written only by migration, which was enough while `site-default` was the
 * only Site that could exist. A Site created from the product has to be given the same four, or
 * its first assignment proposal fails with `ASSIGNMENT_EDITOR_PROFILE_UNAVAILABLE` — an error
 * that was unreachable before Sites became a tenant boundary. The wording matches the migrations
 * that seeded them so that a Site created today and the Site this installation started with are
 * staffed identically.
 */
export const BUILT_IN_AGENT_PROFILE_TEMPLATES: readonly BuiltInAgentProfileTemplate[] =
  Object.freeze([
    Object.freeze({
      role: "researcher" as const,
      name: "Researcher",
      instructions:
        "Widen the evidence behind a Story. Follow what the supplied evidence points at, retrieve material that corroborates, dates, or complicates it, and attach only what a reporter would actually cite. Never attach a page you did not retrieve.",
    }),
    Object.freeze({
      role: "assignment_editor" as const,
      name: "Assignment Editor",
      instructions:
        "Assess evidence and editorial value, choose a bounded disposition, and prepare a focused assignment without exceeding the available evidence.",
    }),
    Object.freeze({
      role: "writer" as const,
      name: "General Writer",
      instructions:
        "Produce original editorial work within the assignment scope, grounded in the supplied evidence, and never invent unsupported facts.",
    }),
    Object.freeze({
      role: "editor_in_chief" as const,
      name: "Director",
      instructions:
        "Independently review work against its assignment and evidence, then approve or request changes within StoryRail's bounded review policy.",
    }),
  ]);
