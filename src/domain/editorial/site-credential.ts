import {
  CREDENTIAL_UNAVAILABLE_REASONS,
  FIRECRAWL_API_KEY_SLOT,
  OPENROUTER_API_KEY_SLOT,
  CREDENTIAL_HINT_LENGTH,
  MAXIMUM_CREDENTIAL_SLOT_LENGTH,
  type CredentialSlot,
  type CredentialUnavailableCode,
  type CredentialUnavailableError,
  type CredentialUnavailableReason,
  type ParseCredentialSlotResult,
} from "./site-credential-types";

const SLOT_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function parseCredentialSlot(candidate: string): ParseCredentialSlotResult {
  const value = typeof candidate === "string" ? candidate.trim() : "";
  if (
    value.length === 0 ||
    value.length > MAXIMUM_CREDENTIAL_SLOT_LENGTH ||
    !SLOT_PATTERN.test(value)
  )
    return {
      ok: false,
      error: {
        code: "CREDENTIAL_SLOT_INVALID",
        message: "A credential slot is lowercase snake_case, such as openrouter_api_key.",
      },
    };
  return { ok: true, slot: value as CredentialSlot };
}

/**
 * The only place a hint is ever produced.
 *
 * Four characters of a secret are given up knowingly, the way a card ending in four digits is,
 * because an operator otherwise has no way to tell which key an installation is running on. A
 * short secret would leak proportionally more of itself, so it yields no hint at all rather than
 * most of itself.
 */
export function credentialHint(secret: string): string {
  const value = secret.trim();
  return value.length > CREDENTIAL_HINT_LENGTH * 2 ? value.slice(-CREDENTIAL_HINT_LENGTH) : "";
}

const REQUIRED_CODES: Readonly<Record<string, CredentialUnavailableCode>> = Object.freeze({
  [OPENROUTER_API_KEY_SLOT]: "OPENROUTER_API_KEY_REQUIRED",
  [FIRECRAWL_API_KEY_SLOT]: "FIRECRAWL_API_KEY_REQUIRED",
});

/**
 * Names a missing credential the way the operator has to act on it.
 *
 * A slot nobody has filled in reports as the familiar `OPENROUTER_API_KEY_REQUIRED` or
 * `FIRECRAWL_API_KEY_REQUIRED`, which said "this is not configured" before this store existed
 * and still does. A slot with no dedicated code — every connector added after this one — falls
 * back to the reason itself rather than needing an entry here first.
 */
export function credentialUnavailable(
  slot: CredentialSlot,
  reason: CredentialUnavailableReason,
  message: string,
): CredentialUnavailableError {
  return {
    code: reason === "CREDENTIAL_NOT_CONFIGURED" ? (REQUIRED_CODES[slot] ?? reason) : reason,
    reason,
    slot,
    message,
  };
}

/**
 * True for the failure shape that means nothing was attempted.
 *
 * Handlers use it to answer with the credential rather than with whatever the work would have
 * been, and it is a structural check so that no layer has to import another to ask.
 */
export function isCredentialUnavailableError(value: unknown): value is CredentialUnavailableError {
  const candidate = value as Partial<CredentialUnavailableError> | null;
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof candidate.slot === "string" &&
    (CREDENTIAL_UNAVAILABLE_REASONS as readonly string[]).includes(candidate.reason as string)
  );
}
