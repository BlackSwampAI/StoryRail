import type { ConfiguredCredential, CredentialSlot, EncryptedCredential } from "@/domain/editorial";

/**
 * Storage for secrets, scoped to one Site by the adapter that implements it.
 *
 * `listConfigured` is the only read the UI is ever offered, and it returns the hint rather than
 * the credential. There is no method here that returns a plaintext secret to a caller that did
 * not already hold the encryption key, and adding one would make the write-only guarantee a
 * matter of who remembers to be careful.
 */
export interface SiteCredentialRepository {
  findBySlot(slot: CredentialSlot): Promise<EncryptedCredential | null>;
  upsert(command: {
    readonly slot: CredentialSlot;
    readonly credential: EncryptedCredential;
    readonly updatedAt: string;
  }): Promise<void>;
  remove(slot: CredentialSlot): Promise<boolean>;
  listConfigured(): Promise<readonly ConfiguredCredential[]>;
}
