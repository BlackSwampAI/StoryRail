import {
  credentialHint,
  MAXIMUM_CREDENTIAL_SECRET_LENGTH,
  type CredentialSlot,
  type SiteId,
} from "@/domain/editorial";

import type { CredentialCipher } from "./credential-cipher";
import type { SiteCredentialRepository } from "./site-credential-repository";

export type SetSiteCredentialResult =
  | { readonly ok: true; readonly slot: CredentialSlot; readonly hint: string }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "CREDENTIAL_SECRET_INVALID" | "CREDENTIAL_KEY_UNAVAILABLE";
        readonly message: string;
      };
    };

export interface SetSiteCredentialDependencies {
  readonly credentials: SiteCredentialRepository;
  readonly siteId: SiteId;
  readonly cipher: CredentialCipher | null;
  readonly now: () => string;
}

/**
 * Writes a secret. The result carries the hint and never the secret, so even a caller that logs
 * everything it is handed cannot log the credential back out again.
 */
export function createSetSiteCredential(dependencies: SetSiteCredentialDependencies) {
  return async (command: {
    readonly slot: CredentialSlot;
    readonly secret: string;
  }): Promise<SetSiteCredentialResult> => {
    const secret = typeof command.secret === "string" ? command.secret.trim() : "";
    if (secret.length === 0 || secret.length > MAXIMUM_CREDENTIAL_SECRET_LENGTH)
      return {
        ok: false,
        error: {
          code: "CREDENTIAL_SECRET_INVALID",
          message: `A credential must be between 1 and ${MAXIMUM_CREDENTIAL_SECRET_LENGTH} characters.`,
        },
      };
    if (!dependencies.cipher)
      return {
        ok: false,
        error: {
          code: "CREDENTIAL_KEY_UNAVAILABLE",
          message: "STORYRAIL_CREDENTIAL_KEY is required before a credential can be stored.",
        },
      };

    const credential = dependencies.cipher.encrypt(secret, {
      siteId: dependencies.siteId,
      slot: command.slot,
    });
    await dependencies.credentials.upsert({
      slot: command.slot,
      credential,
      updatedAt: dependencies.now(),
    });
    return { ok: true, slot: command.slot, hint: credentialHint(secret) };
  };
}

export type SetSiteCredentialWorkflow = ReturnType<typeof createSetSiteCredential>;
