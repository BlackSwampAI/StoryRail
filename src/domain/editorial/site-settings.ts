import {
  MAXIMUM_RESEARCH_CALL_BUDGET,
  MAXIMUM_RESEARCH_TURN_BUDGET,
  SITE_MODEL_ROLES,
  type RecordSiteSettingsResult,
  type SiteDestinationSettings,
  type SiteModelIds,
  type SiteResearchSettings,
  type SiteSearchSettings,
  type SiteSettings,
} from "./site-settings-types";

function trimmedString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * A destination is optional, and a partly filled in one is refused rather than stored.
 *
 * A missing base URL discovered while a delivery is in flight costs an operator a page that
 * half exists somewhere; discovered here it costs them a corrected field. The URL must be
 * absolute for the same reason: a relative address would be resolved against whatever process
 * happened to send the request.
 *
 * The kind is read first and everything else is checked against it, so a StudioCMS renderer
 * package cannot be stored on a WordPress destination that would silently ignore it.
 */
function readDestination(
  value: unknown,
): { readonly ok: true; readonly destination: SiteDestinationSettings } | { readonly ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
  const candidate = value as Record<string, unknown>;
  const kind = candidate.kind;
  if (kind !== "studiocms" && kind !== "wordpress") return { ok: false };

  const allowed =
    kind === "studiocms"
      ? ["kind", "baseUrl", "package", "draft"]
      : ["kind", "baseUrl", "username", "draft"];
  if (Object.keys(candidate).length !== allowed.length) return { ok: false };
  if (!trimmedString(candidate.baseUrl) || typeof candidate.draft !== "boolean")
    return { ok: false };

  const baseUrl = candidate.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return { ok: false };

  if (kind === "studiocms") {
    if (!trimmedString(candidate.package)) return { ok: false };
    return {
      ok: true,
      destination: { kind, baseUrl, package: candidate.package.trim(), draft: candidate.draft },
    };
  }

  // A WordPress username may not be trimmed away to nothing, because the Basic header it forms
  // half of would then authenticate as nobody and every delivery would come back a 401.
  if (!trimmedString(candidate.username)) return { ok: false };
  return {
    ok: true,
    destination: { kind, baseUrl, username: candidate.username.trim(), draft: candidate.draft },
  };
}

/**
 * Search configuration is optional, and a half-filled one is refused for the same reason a
 * half-filled destination is: a missing username discovered when the Researcher is already in
 * flight costs an operator a run to find out about, and the instance answers 401 rather than
 * saying which half was wrong.
 */
function readSearch(
  value: unknown,
): { readonly ok: true; readonly search: SiteSearchSettings } | { readonly ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 2) return { ok: false };
  if (!trimmedString(candidate.baseUrl) || !trimmedString(candidate.username)) return { ok: false };

  const baseUrl = candidate.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return { ok: false };
  return { ok: true, search: { baseUrl, username: candidate.username.trim() } };
}

/**
 * A research budget is both numbers or neither.
 *
 * They are checked as whole numbers within a ceiling rather than accepted as typed: a fractional
 * budget would compare against a running count that only ever moves by one, and a budget of a
 * thousand is a run nobody would sit through and a bill nobody meant to authorise. Zero is
 * refused because a Researcher with no calls cannot retrieve the page it would attach, and a run
 * that can only fail is worse than one an operator never started.
 */
function readResearch(
  value: unknown,
): { readonly ok: true; readonly research: SiteResearchSettings } | { readonly ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).length !== 2) return { ok: false };
  const { maximumCalls, maximumTurns } = candidate;
  if (
    !Number.isInteger(maximumCalls) ||
    !Number.isInteger(maximumTurns) ||
    (maximumCalls as number) < 1 ||
    (maximumTurns as number) < 1 ||
    (maximumCalls as number) > MAXIMUM_RESEARCH_CALL_BUDGET ||
    (maximumTurns as number) > MAXIMUM_RESEARCH_TURN_BUDGET
  )
    return { ok: false };
  return {
    ok: true,
    research: { maximumCalls: maximumCalls as number, maximumTurns: maximumTurns as number },
  };
}

/**
 * Settings are validated before they are stored rather than when a run reaches for them, because
 * a blank model id discovered mid-run costs an operator an Agent Run to find out about.
 */
export function recordSiteSettings(candidate: unknown): RecordSiteSettingsResult {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
    return invalid("Settings name a model for every agent role.");
  const supplied = candidate as {
    readonly models?: unknown;
    readonly destination?: unknown;
    readonly search?: unknown;
    readonly research?: unknown;
  };
  if (
    Object.keys(supplied).some(
      (key) => key !== "models" && key !== "destination" && key !== "search" && key !== "research",
    )
  )
    return invalid(
      "Settings hold the agent models and, at most, a destination, a search, and a research budget.",
    );
  const models = supplied.models;
  if (typeof models !== "object" || models === null || Array.isArray(models))
    return invalid("Settings name a model for every agent role.");

  const entries = Object.entries(models as Record<string, unknown>);
  if (entries.length !== SITE_MODEL_ROLES.length)
    return invalid("Settings name a model for every agent role, and for no other.");

  const trimmed: Record<string, string> = {};
  for (const role of SITE_MODEL_ROLES) {
    const value = (models as Record<string, unknown>)[role];
    if (typeof value !== "string" || value.trim().length === 0)
      return invalid(`The ${role} model must be a model identifier the provider will accept.`);
    trimmed[role] = value.trim();
  }

  // An absent destination and an explicitly null one mean the same thing: this newsroom has
  // nowhere to deliver yet, which is the ordinary state of one nobody has configured.
  const supplierDestination = supplied.destination;
  const destination =
    supplierDestination === undefined || supplierDestination === null
      ? null
      : readDestination(supplierDestination);
  if (destination !== null && !destination.ok)
    return {
      ok: false,
      error: {
        code: "SITE_SETTINGS_DESTINATION_INVALID",
        message:
          "A destination names its kind, an absolute base URL, that kind's own field, and whether pages arrive as drafts.",
      },
    };

  // Absent and explicitly null both mean this newsroom cannot search, which is how every
  // newsroom that has run so far has run.
  const suppliedSearch = supplied.search;
  const search =
    suppliedSearch === undefined || suppliedSearch === null ? null : readSearch(suppliedSearch);
  if (search !== null && !search.ok)
    return {
      ok: false,
      error: {
        code: "SITE_SETTINGS_SEARCH_INVALID",
        message: "Search names an absolute base URL and the username its password belongs to.",
      },
    };

  // Absent and explicitly null both mean this newsroom has not chosen a budget, and a newsroom
  // that has not chosen one runs on what the installation shipped with rather than on nothing.
  const suppliedResearch = supplied.research;
  const research =
    suppliedResearch === undefined || suppliedResearch === null
      ? null
      : readResearch(suppliedResearch);
  if (research !== null && !research.ok)
    return {
      ok: false,
      error: {
        code: "SITE_SETTINGS_RESEARCH_INVALID",
        message: `A research budget names whole numbers of calls and turns, each at least one and at most ${MAXIMUM_RESEARCH_CALL_BUDGET} calls and ${MAXIMUM_RESEARCH_TURN_BUDGET} turns.`,
      },
    };

  return {
    ok: true,
    settings: {
      models: trimmed as unknown as SiteModelIds,
      destination: destination === null ? null : destination.destination,
      search: search === null ? null : search.search,
      research: research === null ? null : research.research,
    } satisfies SiteSettings,
  };
}

function invalid(message: string): RecordSiteSettingsResult {
  return { ok: false, error: { code: "SITE_SETTINGS_MODELS_INVALID", message } };
}
