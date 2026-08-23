import type { Pool, QueryResultRow } from "pg";

import type { SiteCredentialRepository } from "@/application/site-credentials";
import {
  parseCredentialSlot,
  type ConfiguredCredential,
  type CredentialSlot,
  type EncryptedCredential,
  type SiteId,
} from "@/domain/editorial";

export interface CreatePostgresSiteCredentialRepositoryOptions {
  readonly pool: Pool;
  readonly siteId: SiteId;
}

interface CredentialRow extends QueryResultRow {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly auth_tag: Buffer;
  readonly key_version: number;
  readonly hint: string;
}

interface ConfiguredRow extends QueryResultRow {
  readonly slot: string;
  readonly hint: string;
  readonly updated_at: Date;
}

export class PostgresSiteCredentialInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible stored credential.");
    this.name = "PostgresSiteCredentialInvariantError";
  }
}

export function createPostgresSiteCredentialRepository(
  options: CreatePostgresSiteCredentialRepositoryOptions,
): SiteCredentialRepository {
  return {
    async findBySlot(slot: CredentialSlot): Promise<EncryptedCredential | null> {
      const result = await options.pool.query<CredentialRow>(
        `SELECT ciphertext, nonce, auth_tag, key_version, hint
         FROM storyrail.site_credentials
         WHERE site_id = $1 AND slot = $2`,
        [options.siteId, slot],
      );
      const row = result.rows[0];
      if (!row) return null;
      if (!Number.isInteger(row.key_version) || row.key_version < 1)
        throw new PostgresSiteCredentialInvariantError();
      return Object.freeze({
        ciphertext: new Uint8Array(row.ciphertext),
        nonce: new Uint8Array(row.nonce),
        authTag: new Uint8Array(row.auth_tag),
        keyVersion: row.key_version,
        hint: row.hint,
      });
    },

    async upsert(command): Promise<void> {
      await options.pool.query(
        `INSERT INTO storyrail.site_credentials
           (site_id, slot, ciphertext, nonce, auth_tag, key_version, hint, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (site_id, slot) DO UPDATE
           SET ciphertext = EXCLUDED.ciphertext,
               nonce = EXCLUDED.nonce,
               auth_tag = EXCLUDED.auth_tag,
               key_version = EXCLUDED.key_version,
               hint = EXCLUDED.hint,
               updated_at = EXCLUDED.updated_at`,
        [
          options.siteId,
          command.slot,
          Buffer.from(command.credential.ciphertext),
          Buffer.from(command.credential.nonce),
          Buffer.from(command.credential.authTag),
          command.credential.keyVersion,
          command.credential.hint,
          command.updatedAt,
        ],
      );
    },

    async remove(slot: CredentialSlot): Promise<boolean> {
      const result = await options.pool.query(
        "DELETE FROM storyrail.site_credentials WHERE site_id = $1 AND slot = $2",
        [options.siteId, slot],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listConfigured(): Promise<readonly ConfiguredCredential[]> {
      // The ciphertext is not in this projection, so no caller of this method can leak it by
      // handing the row on to something that serialises whatever it is given.
      const result = await options.pool.query<ConfiguredRow>(
        `SELECT slot, hint, updated_at
         FROM storyrail.site_credentials
         WHERE site_id = $1
         ORDER BY slot COLLATE "C" ASC`,
        [options.siteId],
      );
      return result.rows.map((row) => {
        const slot = parseCredentialSlot(row.slot);
        if (!slot.ok) throw new PostgresSiteCredentialInvariantError();
        return Object.freeze({
          slot: slot.slot,
          hint: row.hint,
          updatedAt: row.updated_at.toISOString(),
        });
      });
    },
  };
}
