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

/**
 * Where a newsroom delivers a published Story.
 *
 * The API token is deliberately absent: it is a secret and lives in the encrypted credential
 * store, so nothing that reads settings can serialise it by accident. There is no author either
 * — the destination attributes every page to whoever owns the token that created it and ignores
 * any author sent with the request, so a setting for one would do nothing but look like it did.
 */
export interface SiteDestinationSettings {
  readonly baseUrl: string;
  /** The renderer the destination stores content under, such as `studiocms/markdown`. */
  readonly package: string;
  /**
   * Whether pages arrive unpublished. It defaults to true, because StoryRail's first write to
   * the outside world should not be able to put a bad run in front of readers: the system makes
   * the page and a human decides it is fit to be seen.
   */
  readonly draft: boolean;
}

export const DEFAULT_DESTINATION_DRAFT = true;

export interface SiteSettings {
  readonly models: SiteModelIds;
  /** Null for a newsroom that has not been given anywhere to deliver, which is most of them. */
  readonly destination: SiteDestinationSettings | null;
}

export type SiteSettingsValidationCode =
  "SITE_SETTINGS_MODELS_INVALID" | "SITE_SETTINGS_DESTINATION_INVALID";

export type RecordSiteSettingsResult =
  | { readonly ok: true; readonly settings: SiteSettings }
  | {
      readonly ok: false;
      readonly error: { readonly code: SiteSettingsValidationCode; readonly message: string };
    };
