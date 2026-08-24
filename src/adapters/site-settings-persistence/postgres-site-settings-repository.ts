import type { Pool, QueryResultRow } from "pg";

import type { SiteSettingsRepository } from "@/application/site-settings";
import { recordSiteSettings, type SiteId, type SiteSettings } from "@/domain/editorial";

export interface CreatePostgresSiteSettingsRepositoryOptions {
  readonly pool: Pool;
  readonly siteId: SiteId;
}

interface SettingsRow extends QueryResultRow {
  readonly payload: unknown;
}

export class PostgresSiteSettingsInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned invalid or impossible persisted Site settings.");
    this.name = "PostgresSiteSettingsInvariantError";
  }
}

export function createPostgresSiteSettingsRepository(
  options: CreatePostgresSiteSettingsRepositoryOptions,
): SiteSettingsRepository {
  return {
    async find(): Promise<SiteSettings | null> {
      const result = await options.pool.query<SettingsRow>(
        "SELECT payload FROM storyrail.site_settings WHERE site_id = $1",
        [options.siteId],
      );
      const row = result.rows[0];
      if (!row) return null;
      const decoded = recordSiteSettings(row.payload);
      if (!decoded.ok) throw new PostgresSiteSettingsInvariantError();
      return decoded.settings;
    },

    async update(command): Promise<void> {
      await options.pool.query(
        `INSERT INTO storyrail.site_settings (site_id, payload, updated_at)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (site_id) DO UPDATE
           SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
        [
          options.siteId,
          // A newsroom with nowhere to deliver stores no destination key at all rather than a
          // null one, so the absent case has one representation in the database instead of two.
          JSON.stringify({
            models: command.settings.models,
            ...(command.settings.destination ? { destination: command.settings.destination } : {}),
          }),
          command.updatedAt,
        ],
      );
    },
  };
}
