import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { CredentialCipher } from "@/application/site-credentials";
import {
  credentialHint,
  type CredentialAad,
  type CredentialDecryptResult,
  type EncryptedCredential,
} from "@/domain/editorial";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/** Only one key exists. Rotation will start numbering from here rather than from nothing. */
export const CURRENT_KEY_VERSION = 1;

export class CredentialCipherKeyError extends Error {
  readonly code = "STORYRAIL_CREDENTIAL_KEY_INVALID" as const;

  constructor() {
    super(
      `STORYRAIL_CREDENTIAL_KEY must be exactly ${KEY_BYTES} bytes of base64-encoded random data.`,
    );
    this.name = "CredentialCipherKeyError";
  }
}

/**
 * The one place `node:crypto` is used for stored credentials.
 *
 * Two properties carry the weight. A fresh random nonce is generated for every encryption and
 * never derived from anything, because reusing a nonce under GCM does not weaken the cipher, it
 * breaks it. And the site and slot a credential was written for are authenticated alongside it,
 * so a ciphertext lifted out of one newsroom's row and pasted into another's fails to
 * authenticate instead of decrypting into the wrong newsroom's hands. That is a property of the
 * cipher rather than of the queries around it, which is why no repository can undo it.
 */
export function createAesGcmCredentialCipher(options: { readonly key: string }): CredentialCipher {
  const key = decodeKey(options.key);

  return Object.freeze({
    encrypt(plaintext: string, aad: CredentialAad): EncryptedCredential {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
      cipher.setAAD(additionalData(aad));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      return Object.freeze({
        ciphertext: new Uint8Array(ciphertext),
        nonce: new Uint8Array(nonce),
        authTag: new Uint8Array(cipher.getAuthTag()),
        keyVersion: CURRENT_KEY_VERSION,
        hint: credentialHint(plaintext),
      });
    },

    decrypt(credential: EncryptedCredential, aad: CredentialAad): CredentialDecryptResult {
      // Every way this can fail — the wrong key, a tampered ciphertext, a tampered tag, a row
      // written for another site — answers the same way. Telling them apart would let a caller
      // that can read the table use this as an oracle for which of its guesses was closer.
      try {
        if (credential.nonce.length !== NONCE_BYTES || credential.authTag.length !== AUTH_TAG_BYTES)
          return unreadable();
        const decipher = createDecipheriv(ALGORITHM, key, credential.nonce, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(additionalData(aad));
        decipher.setAuthTag(credential.authTag);
        const opened = Buffer.concat([
          decipher.update(Buffer.from(credential.ciphertext)),
          decipher.final(),
        ]);
        return { ok: true, secret: opened.toString("utf8") };
      } catch {
        return unreadable();
      }
    },
  });
}

function unreadable(): CredentialDecryptResult {
  return { ok: false, error: { code: "CREDENTIAL_UNREADABLE" } };
}

function additionalData(aad: CredentialAad): Buffer {
  return Buffer.from(`${aad.siteId}:${aad.slot}`, "utf8");
}

function decodeKey(candidate: string): Buffer {
  const trimmed = candidate.trim();
  // Base64 decoding in Node silently discards anything it cannot read, so a typo would otherwise
  // become a shorter key that still works and can never be reproduced.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) throw new CredentialCipherKeyError();
  const key = Buffer.from(trimmed, "base64");
  if (key.length !== KEY_BYTES) throw new CredentialCipherKeyError();
  return key;
}
