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

export const SITE_DESTINATION_KINDS = ["studiocms", "wordpress"] as const;

/**
 * Which kind of website a newsroom delivers to. It is stored rather than inferred from the shape
 * of the rest of the settings: a discriminant worked out from which fields happen to be present
 * is a second source of truth that disagrees with the first as soon as two kinds share a field.
 */
export type SiteDestinationKind = (typeof SITE_DESTINATION_KINDS)[number];

interface SiteDestinationCommon {
  readonly baseUrl: string;
  /**
   * Whether pages arrive unpublished. It defaults to true, because StoryRail's first write to
   * the outside world should not be able to put a bad run in front of readers: the system makes
   * the page and a human decides it is fit to be seen.
   */
  readonly draft: boolean;
}

/**
 * Where a newsroom delivers a published Story, and which kind of software is at the other end.
 *
 * The secret is deliberately absent from every member: it lives in the encrypted credential
 * store, so nothing that reads settings can serialise it by accident.
 *
 * `package` and `username` stay on the member that needs them rather than being hoisted into
 * the common half for symmetry. A renderer package means nothing to WordPress and a WordPress
 * user means nothing to StudioCMS, so a shared field would be one an operator could fill in for
 * a destination that ignores it.
 */
export type SiteDestinationSettings =
  | (SiteDestinationCommon & {
      readonly kind: "studiocms";
      /** The renderer the destination stores content under, such as `studiocms/markdown`. */
      readonly package: string;
    })
  | (SiteDestinationCommon & {
      readonly kind: "wordpress";
      /**
       * The WordPress user the Application Password belongs to. It is not a secret — it is half
       * of an HTTP Basic header and appears on every published post — so it is a setting rather
       * than a credential, and the password it pairs with is neither stored nor returned here.
       */
      readonly username: string;
    });

export const DEFAULT_DESTINATION_DRAFT = true;

/**
 * The SearXNG instance a newsroom discovers candidate pages through.
 *
 * SearXNG has no authentication of its own — `secret_key` governs sessions, not access — so
 * whatever protects an instance sits in front of it. The username is half of an HTTP Basic
 * header and is not a secret; the password it pairs with lives in the encrypted credential
 * store and is deliberately not a field here, so nothing that reads settings can serialise it.
 */
export interface SiteSearchSettings {
  readonly baseUrl: string;
  readonly username: string;
}

export interface SiteSettings {
  readonly models: SiteModelIds;
  /** Null for a newsroom that has not been given anywhere to deliver, which is most of them. */
  readonly destination: SiteDestinationSettings | null;
  /** Null for a newsroom that cannot search the web, which is the ordinary case. */
  readonly search: SiteSearchSettings | null;
}

export type SiteSettingsValidationCode =
  | "SITE_SETTINGS_MODELS_INVALID"
  | "SITE_SETTINGS_DESTINATION_INVALID"
  | "SITE_SETTINGS_SEARCH_INVALID";

export type RecordSiteSettingsResult =
  | { readonly ok: true; readonly settings: SiteSettings }
  | {
      readonly ok: false;
      readonly error: { readonly code: SiteSettingsValidationCode; readonly message: string };
    };
