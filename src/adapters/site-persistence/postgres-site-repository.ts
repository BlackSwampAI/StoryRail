import type { Pool, QueryResultRow } from "pg";

import type { CreateSiteResult, SiteRepository } from "@/application/sites";
import type { AgentProfile, Site, SiteId } from "@/domain/editorial";

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

const SITE_DOMAIN_UNIQUE_INDEX = "sites_domain_unique_index";

function isUniqueViolation(error: unknown, constraint: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "23505" &&
    (error as { constraint?: unknown }).constraint === constraint
  );
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

    async create(site: Site, builtInProfiles: readonly AgentProfile[]): Promise<CreateSiteResult> {
      const client = await options.pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "INSERT INTO storyrail.sites (site_id, payload) VALUES ($1, $2::jsonb)",
          [site.id, JSON.stringify(site)],
        );
        for (const profile of builtInProfiles) {
          await client.query(
            `INSERT INTO storyrail.agent_profiles (profile_id, role, built_in, payload, site_id)
             VALUES ($1, $2, $3, $4::jsonb, $5)`,
            [profile.id, profile.role, profile.builtIn, JSON.stringify(profile), site.id],
          );
        }
        await client.query("COMMIT");
        return { ok: true, site: structuredClone(site) };
      } catch (error) {
        await client.query("ROLLBACK");
        // The unique index on the domain is the only rule here an operator can break by typing,
        // so it is turned back into words at the boundary where the constraint is named. Every
        // other failure is a defect and keeps its original shape.
        if (isUniqueViolation(error, SITE_DOMAIN_UNIQUE_INDEX)) {
          return {
            ok: false,
            error: {
              code: "SITE_DOMAIN_TAKEN",
              message: `Another Site already publishes ${site.domain}.`,
              domain: site.domain,
            },
          };
        }
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
