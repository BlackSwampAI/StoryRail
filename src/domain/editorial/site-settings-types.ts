/**
 * The model each agent role runs on, chosen per newsroom.
 *
 * These are configuration rather than secrets: knowing which model a newsroom writes with costs
 * it nothing, and encrypting them would only make them harder to read when a run has to be
 * explained. They sit beside the credentials rather than inside them for that reason.
 */
export interface SiteModelIds {
  readonly evidencePreparation: string;
  readonly assignmentEditor: string;
  readonly writer: string;
  readonly director: string;
  readonly researcher: string;
}

export const SITE_MODEL_ROLES = [
  "evidencePreparation",
  "assignmentEditor",
  "writer",
  "director",
  "researcher",
] as const;

export type SiteModelRole = (typeof SITE_MODEL_ROLES)[number];

export interface SiteSettings {
  readonly models: SiteModelIds;
}

export type SiteSettingsValidationCode = "SITE_SETTINGS_MODELS_INVALID";

export type RecordSiteSettingsResult =
  | { readonly ok: true; readonly settings: SiteSettings }
  | {
      readonly ok: false;
      readonly error: { readonly code: SiteSettingsValidationCode; readonly message: string };
    };
