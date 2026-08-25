import {
  CREDENTIAL_HINT_LENGTH,
  CREDENTIAL_UNAVAILABLE_REASONS,
  SITE_MODEL_ROLES,
  type ConfiguredCredential,
  type CredentialSlot,
  type CredentialUnavailableError,
  type CredentialUnavailableReason,
  type SiteId,
  type SiteModelIds,
  type SiteSettings,
} from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE =
  "The settings request could not be completed.";

export interface SiteSettingsSnapshot {
  readonly settings: SiteSettings;
  readonly credentials: readonly ConfiguredCredential[];
}

/**
 * What a write answers with. There is no secret here and there never can be: the store returns
 * four characters of the value so an operator can tell which key is installed, and the client
 * has no field to put the value itself in even if a route one day tried to send it back.
 */
export interface CredentialAcknowledgement {
  readonly slot: CredentialSlot;
  readonly hint: string;
}

export type SiteSettingsClientResult<Value> =
  | { readonly kind: "completed"; readonly value: Value }
  | {
      readonly kind: "application-failure";
      readonly error: { readonly code: string; readonly message: string };
    }
  // Kept apart from an ordinary failure because the remedies differ: entering a key fixes one of
  // these and only restoring an encryption key fixes another, and an operator told "something
  // went wrong" cannot tell which of the two they are looking at.
  | { readonly kind: "credential-unavailable"; readonly error: CredentialUnavailableError }
  | {
      readonly kind: "unavailable";
      readonly message: typeof SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE;
    };

export interface SiteSettingsClient {
  readonly readSettings: () => Promise<SiteSettingsClientResult<SiteSettingsSnapshot>>;
  readonly saveModels: (models: SiteModelIds) => Promise<SiteSettingsClientResult<SiteSettings>>;
  readonly setCredential: (
    slot: CredentialSlot,
    secret: string,
  ) => Promise<SiteSettingsClientResult<CredentialAcknowledgement>>;
  readonly removeCredential: (
    slot: CredentialSlot,
  ) => Promise<SiteSettingsClientResult<CredentialSlot>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function isModelId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

/**
 * The destination is read but never shown. This screen has no field for it, so the check exists
 * only so that a newsroom which has one configured does not read as an unreadable response.
 */
function isDestination(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value) || !isModelId(value.baseUrl) || typeof value.draft !== "boolean")
    return false;
  return value.kind === "studiocms"
    ? exact(value, ["kind", "baseUrl", "package", "draft"]) && isModelId(value.package)
    : value.kind === "wordpress" &&
        exact(value, ["kind", "baseUrl", "username", "draft"]) &&
        isModelId(value.username);
}

function isSettings(value: unknown): value is SiteSettings {
  return (
    isRecord(value) &&
    (exact(value, ["models"]) || exact(value, ["models", "destination"])) &&
    isDestination(value.destination ?? null) &&
    isRecord(value.models) &&
    exact(value.models, SITE_MODEL_ROLES) &&
    SITE_MODEL_ROLES.every((role) => isModelId((value.models as Record<string, unknown>)[role]))
  );
}

/**
 * A hint is four characters, or empty for a secret short enough that four characters would give
 * away too much of it. Any other length means something other than the credential store answered.
 */
function isHint(value: unknown): value is string {
  return (
    typeof value === "string" && (value.length === 0 || value.length === CREDENTIAL_HINT_LENGTH)
  );
}

function isSlot(value: unknown): value is CredentialSlot {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function isConfiguredCredential(value: unknown): value is ConfiguredCredential {
  return (
    isRecord(value) &&
    exact(value, ["slot", "hint", "updatedAt"]) &&
    isSlot(value.slot) &&
    isHint(value.hint) &&
    typeof value.updatedAt === "string" &&
    value.updatedAt.length > 0
  );
}

function unavailable(): SiteSettingsClientResult<never> {
  return { kind: "unavailable", message: SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE };
}

function credentialFailure(body: Record<string, unknown>): CredentialUnavailableError | null {
  const error = body.error;
  if (
    !isRecord(error) ||
    typeof error.code !== "string" ||
    typeof error.message !== "string" ||
    !isSlot(error.slot) ||
    typeof error.reason !== "string" ||
    !(CREDENTIAL_UNAVAILABLE_REASONS as readonly string[]).includes(error.reason)
  )
    return null;
  return {
    code: error.code as CredentialUnavailableError["code"],
    reason: error.reason as CredentialUnavailableReason,
    slot: error.slot,
    message: error.message,
  };
}

async function parse<Value>(
  response: Response,
  read: (body: Record<string, unknown>) => Value | null,
): Promise<SiteSettingsClientResult<Value>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unavailable();
  }
  if (!isRecord(body)) return unavailable();

  if (response.ok && body.ok === true) {
    const value = read(body);
    return value === null ? unavailable() : { kind: "completed", value };
  }
  if (body.ok === false) {
    const credential = credentialFailure(body);
    if (credential) return { kind: "credential-unavailable", error: credential };
    if (
      response.status >= 400 &&
      response.status < 500 &&
      isRecord(body.error) &&
      typeof body.error.code === "string" &&
      typeof body.error.message === "string"
    )
      return {
        kind: "application-failure",
        error: { code: body.error.code, message: body.error.message },
      };
  }
  return unavailable();
}

const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" } as const;

export function createSiteSettingsClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): SiteSettingsClient {
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  return {
    async readSettings() {
      try {
        const response = await dependencies.fetch(api("/site-settings"), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        return await parse(response, (body) =>
          isSettings(body.settings) &&
          Array.isArray(body.credentials) &&
          body.credentials.every(isConfiguredCredential)
            ? { settings: body.settings, credentials: body.credentials }
            : null,
        );
      } catch {
        return unavailable();
      }
    },
    async saveModels(models) {
      try {
        const response = await dependencies.fetch(api("/site-settings"), {
          method: "PUT",
          headers: JSON_HEADERS,
          body: JSON.stringify({ models }),
        });
        return await parse(response, (body) => (isSettings(body.settings) ? body.settings : null));
      } catch {
        return unavailable();
      }
    },
    async setCredential(slot, secret) {
      try {
        const response = await dependencies.fetch(
          api(`/site-credentials/${encodeURIComponent(slot)}`),
          { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ secret }) },
        );
        return await parse(response, (body) =>
          isSlot(body.slot) && isHint(body.hint) ? { slot: body.slot, hint: body.hint } : null,
        );
      } catch {
        return unavailable();
      }
    },
    async removeCredential(slot) {
      try {
        const response = await dependencies.fetch(
          api(`/site-credentials/${encodeURIComponent(slot)}`),
          { method: "DELETE", headers: { Accept: "application/json" } },
        );
        return await parse(response, (body) => (isSlot(body.slot) ? body.slot : null));
      } catch {
        return unavailable();
      }
    },
  };
}
