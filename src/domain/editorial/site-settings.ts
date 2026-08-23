import {
  SITE_MODEL_ROLES,
  type RecordSiteSettingsResult,
  type SiteModelIds,
  type SiteSettings,
} from "./site-settings-types";

/**
 * Settings are validated before they are stored rather than when a run reaches for them, because
 * a blank model id discovered mid-run costs an operator an Agent Run to find out about.
 */
export function recordSiteSettings(candidate: unknown): RecordSiteSettingsResult {
  const models = (candidate as { readonly models?: unknown } | null | undefined)?.models;
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

  return {
    ok: true,
    settings: { models: trimmed as unknown as SiteModelIds } satisfies SiteSettings,
  };
}

function invalid(message: string): RecordSiteSettingsResult {
  return { ok: false, error: { code: "SITE_SETTINGS_MODELS_INVALID", message } };
}
