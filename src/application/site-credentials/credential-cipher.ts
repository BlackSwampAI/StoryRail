import type {
  CredentialAad,
  CredentialDecryptResult,
  EncryptedCredential,
} from "@/domain/editorial";

/**
 * Encryption as a port, so the domain and the workflows never see `node:crypto`.
 *
 * `decrypt` returns a result and never throws. A credential that does not authenticate is an
 * ordinary thing to find — the key was rotated, the row was tampered with, the ciphertext was
 * copied in from another site — and an operator needs to be told which of those it was only to
 * the extent of "unreadable". Anything finer is an oracle.
 */
export interface CredentialCipher {
  encrypt(plaintext: string, aad: CredentialAad): EncryptedCredential;
  decrypt(credential: EncryptedCredential, aad: CredentialAad): CredentialDecryptResult;
}
