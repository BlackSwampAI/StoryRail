import {
  credentialUnavailable,
  type CredentialSlot,
  type CredentialUnavailableError,
  type CredentialUnavailableReason,
  type SiteId,
} from "@/domain/editorial";

import type { CredentialCipher } from "./credential-cipher";
import type { SiteCredentialRepository } from "./site-credential-repository";

export type ResolveCredentialResult =
  | { readonly ok: true; readonly secret: string }
  | { readonly ok: false; readonly error: CredentialUnavailableError };

export interface ResolveCredentialDependencies {
  readonly credentials: SiteCredentialRepository;
  readonly siteId: SiteId;
  /**
   * Null when `STORYRAIL_CREDENTIAL_KEY` is absent. The cipher is asked for rather than held so
   * that an installation with no key still starts, and only fails at the credential it cannot
   * read rather than at the first page anybody opens.
   */
  readonly cipher: CredentialCipher | null;
}

/**
 * Reads one credential and decrypts it, at the moment it is needed.
 *
 * Never at composition time: the runtime providers memoise, so a credential fetched while a
 * runtime is built would be the credential that process used until it restarted, and a key
 * changed in the settings screen would appear to do nothing.
 */
export function createResolveCredential(dependencies: ResolveCredentialDependencies) {
  return async (slot: CredentialSlot): Promise<ResolveCredentialResult> => {
    const stored = await dependencies.credentials.findBySlot(slot);
    if (!stored)
      return failure(
        slot,
        "CREDENTIAL_NOT_CONFIGURED",
        `No ${slot} has been configured for this newsroom.`,
      );
    if (!dependencies.cipher)
      return failure(
        slot,
        "CREDENTIAL_KEY_UNAVAILABLE",
        "STORYRAIL_CREDENTIAL_KEY is required to read a stored credential.",
      );

    const opened = dependencies.cipher.decrypt(stored, {
      siteId: dependencies.siteId,
      slot,
    });
    return opened.ok
      ? { ok: true, secret: opened.secret }
      : failure(
          slot,
          "CREDENTIAL_UNREADABLE",
          `The stored ${slot} could not be read with the configured encryption key.`,
        );
  };
}

export type ResolveCredential = ReturnType<typeof createResolveCredential>;

function failure(
  slot: CredentialSlot,
  reason: CredentialUnavailableReason,
  message: string,
): ResolveCredentialResult {
  return { ok: false, error: credentialUnavailable(slot, reason, message) };
}
