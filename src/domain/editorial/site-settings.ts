import {
  SITE_MODEL_ROLES,
  type RecordSiteSettingsResult,
  type SiteDestinationSettings,
  type SiteModelIds,
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
 */
function readDestination(
  value: unknown,
): { readonly ok: true; readonly destination: SiteDestinationSettings } | { readonly ok: false } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { ok: false };
  const candidate = value as Record<string, unknown>;
  const allowed = ["baseUrl", "package", "draft"];
  if (Object.keys(candidate).length !== allowed.length) return { ok: false };
  if (
    !trimmedString(candidate.baseUrl) ||
    !trimmedString(candidate.package) ||
    typeof candidate.draft !== "boolean"
  )
    return { ok: false };

  const baseUrl = candidate.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(baseUrl)) return { ok: false };

  return {
    ok: true,
    destination: {
      baseUrl,
      package: candidate.package.trim(),
      draft: candidate.draft,
    },
  };
}

/**
 * Settings are validated before they are stored rather than when a run reaches for them, because
 * a blank model id discovered mid-run costs an operator an Agent Run to find out about.
 */
export function recordSiteSettings(candidate: unknown): RecordSiteSettingsResult {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate))
    return invalid("Settings name a model for every agent role.");
  const supplied = candidate as { readonly models?: unknown; readonly destination?: unknown };
  if (Object.keys(supplied).some((key) => key !== "models" && key !== "destination"))
    return invalid("Settings hold the agent models and, at most, a destination.");
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
          "A destination names an absolute base URL, a content package, and whether pages arrive as drafts.",
      },
    };

  return {
    ok: true,
    settings: {
      models: trimmed as unknown as SiteModelIds,
      destination: destination === null ? null : destination.destination,
    } satisfies SiteSettings,
  };
}

function invalid(message: string): RecordSiteSettingsResult {
  return { ok: false, error: { code: "SITE_SETTINGS_MODELS_INVALID", message } };
}
