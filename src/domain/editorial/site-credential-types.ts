import type { SiteId } from "./types";

declare const credentialSlotBrand: unique symbol;

/**
 * Which credential a stored secret is, named rather than enumerated.
 *
 * New connectors arrive without a schema change or a domain change, so the type says what a slot
 * name may look like and never which names exist. The format is the part worth fixing: a slot is
 * a key in a URL and a column value, so it is lowercase snake_case and nothing else.
 */
export type CredentialSlot = string & { readonly [credentialSlotBrand]: "CredentialSlot" };

export const OPENROUTER_API_KEY_SLOT = "openrouter_api_key" as CredentialSlot;
export const FIRECRAWL_API_KEY_SLOT = "firecrawl_api_key" as CredentialSlot;
export const STUDIOCMS_API_TOKEN_SLOT = "studiocms_api_token" as CredentialSlot;

export const MAXIMUM_CREDENTIAL_SLOT_LENGTH = 64;
export const MAXIMUM_CREDENTIAL_SECRET_LENGTH = 4_096;
export const CREDENTIAL_HINT_LENGTH = 4;

export type CredentialSlotValidationCode = "CREDENTIAL_SLOT_INVALID";

export type ParseCredentialSlotResult =
  | { readonly ok: true; readonly slot: CredentialSlot }
  | {
      readonly ok: false;
      readonly error: { readonly code: CredentialSlotValidationCode; readonly message: string };
    };

/**
 * A secret at rest, and the only shape the rest of the system ever sees one in.
 *
 * The plaintext is not a field here on purpose: nothing that holds an `EncryptedCredential` can
 * accidentally serialise the secret, because it does not have it.
 */
export interface EncryptedCredential {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly authTag: Uint8Array;
  readonly keyVersion: number;
  readonly hint: string;
}

/**
 * The row a ciphertext was written for. Binding these two values into the encryption is what
 * stops a ciphertext copied between rows from being readable in its new home.
 */
export interface CredentialAad {
  readonly siteId: SiteId;
  readonly slot: CredentialSlot;
}

/**
 * What a listing may say about a credential: that it exists, roughly which one it is, and when
 * it last changed. Deliberately not a superset of anything that could carry the secret.
 */
export interface ConfiguredCredential {
  readonly slot: CredentialSlot;
  readonly hint: string;
  readonly updatedAt: string;
}

export const CREDENTIAL_UNAVAILABLE_REASONS = [
  // No credential has been entered for this slot. The remedy is to enter one.
  "CREDENTIAL_NOT_CONFIGURED",
  // A credential exists but there is no key to read it with, which is a deployment mistake
  // rather than a missing setting, and naming it as "not configured" sends the operator to a
  // settings screen that will not help.
  "CREDENTIAL_KEY_UNAVAILABLE",
  // A credential exists and the key present cannot open it. The remedy is the previous key.
  "CREDENTIAL_UNREADABLE",
] as const;

export type CredentialUnavailableReason = (typeof CREDENTIAL_UNAVAILABLE_REASONS)[number];

export type CredentialUnavailableCode =
  "OPENROUTER_API_KEY_REQUIRED" | "FIRECRAWL_API_KEY_REQUIRED" | CredentialUnavailableReason;

/**
 * What an operator is told when work could not be attempted for want of a credential.
 *
 * It names the slot, because "a credential is missing" is not actionable and "no Firecrawl key
 * is configured" is. It keeps the reason separate from the code so that "nothing was entered"
 * and "what was entered cannot be read" stay distinguishable all the way out to the response:
 * the first is fixed by entering a key and the second by restoring the encryption key that was
 * in use when it was written.
 */
export interface CredentialUnavailableError {
  readonly code: CredentialUnavailableCode;
  readonly reason: CredentialUnavailableReason;
  readonly slot: CredentialSlot;
  readonly message: string;
}

/**
 * A resolved credential, or the named reason there is none.
 *
 * A result rather than an exception, because an installation that has had no credentials entered
 * yet is the ordinary state of a fresh one rather than an exceptional one.
 */
export type ApiKeyResolution =
  | { readonly ok: true; readonly apiKey: string }
  | { readonly ok: false; readonly error: CredentialUnavailableError };

export type CredentialDecryptResult =
  | { readonly ok: true; readonly secret: string }
  | { readonly ok: false; readonly error: { readonly code: "CREDENTIAL_UNREADABLE" } };
