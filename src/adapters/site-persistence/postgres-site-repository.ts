import type { Pool, QueryResultRow } from "pg";

import type { SiteRepository } from "@/application/sites";
import type { Site, SiteId } from "@/domain/editorial";

export interface CreatePostgresSiteRepositoryOptions {
  readonly pool: Pool;
}

interface SiteRow extends QueryResultRow {
  readonly payload: unknown;
}

export class PostgresSiteInvariantError extends Error {
  constructor() {
    super("PostgreSQL returned an invalid or impossible persisted Site.");
    this.name = "PostgresSiteInvariantError";
  }
}

function isTrimmedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function decodeSite(payload: unknown): Site {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    !isTrimmedText((payload as { id: unknown }).id) ||
    !isTrimmedText((payload as { name: unknown }).name) ||
    !isTrimmedText((payload as { domain: unknown }).domain) ||
    !isTrimmedText((payload as { description: unknown }).description)
  ) {
    throw new PostgresSiteInvariantError();
  }

  return structuredClone(payload) as Site;
}

export function createPostgresSiteRepository(
  options: CreatePostgresSiteRepositoryOptions,
): SiteRepository {
  return {
    async findById(id: SiteId): Promise<Site | null> {
      const result = await options.pool.query<SiteRow>(
        "SELECT payload FROM storyrail.sites WHERE site_id = $1",
        [id],
      );
      const row = result.rows[0];
      return row ? decodeSite(row.payload) : null;
    },

    async list(): Promise<readonly Site[]> {
      const result = await options.pool.query<SiteRow>(
        `SELECT payload FROM storyrail.sites ORDER BY site_id COLLATE "C" ASC`,
      );
      return result.rows.map((row) => decodeSite(row.payload));
    },
  };
}
