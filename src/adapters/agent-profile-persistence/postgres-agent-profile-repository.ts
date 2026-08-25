import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentProfileRepository,
  AppendAgentProfileResult,
} from "@/application/agent-profiles";
import type { AgentProfile, AgentProfileId, AgentProfileRole, SiteId } from "@/domain/editorial";

import { decodePostgresAgentProfile } from "./postgres-agent-profile-decoder";

interface AgentProfileRow extends QueryResultRow {
  readonly profile_id: unknown;
  readonly role: unknown;
  readonly built_in: unknown;
  readonly payload: unknown;
}

async function findById(
  pool: Pool,
  siteId: SiteId,
  profileId: AgentProfileId,
): Promise<AgentProfile | null> {
  const result = await pool.query<AgentProfileRow>(
    `SELECT profile_id, role, built_in, payload
     FROM storyrail.agent_profiles
     WHERE profile_id = $1
       AND site_id = $2`,
    [profileId, siteId],
  );
  return result.rows[0] ? decodePostgresAgentProfile(result.rows[0]) : null;
}

export function createPostgresAgentProfileRepository(options: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): AgentProfileRepository {
  return {
    findById: (profileId) => findById(options.pool, options.siteId, profileId),

    async findBuiltIn(role: AgentProfileRole) {
      const result = await options.pool.query<AgentProfileRow>(
        `SELECT profile_id, role, built_in, payload
         FROM storyrail.agent_profiles
         WHERE site_id = $1
           AND role = $2
           AND built_in
         ORDER BY profile_id COLLATE "C" ASC
         LIMIT 1`,
        [options.siteId, role],
      );
      return result.rows[0] ? decodePostgresAgentProfile(result.rows[0]) : null;
    },
    async append(profile): Promise<AppendAgentProfileResult> {
      const inserted = await options.pool.query<AgentProfileRow>(
        `INSERT INTO storyrail.agent_profiles (profile_id, role, built_in, payload, site_id)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT DO NOTHING
         RETURNING profile_id, role, built_in, payload`,
        [profile.id, profile.role, profile.builtIn, JSON.stringify(profile), options.siteId],
      );
      if (inserted.rows[0]) {
        return { ok: true, profile: decodePostgresAgentProfile(inserted.rows[0]) };
      }

      const existing = await findById(options.pool, options.siteId, profile.id);
      // The identifier is taken by a Profile on another Site, which this Site may not be told
      // about. It is a conflict here in exactly the way a visible duplicate would be.
      if (!existing)
        return {
          ok: false,
          error: {
            code: "AGENT_PROFILE_ID_CONFLICT",
            message: "A different Agent Profile with the same ID already exists.",
            profileId: profile.id,
          },
        };
      return isDeepStrictEqual(existing, profile)
        ? { ok: true, profile: structuredClone(existing) }
        : {
            ok: false,
            error: {
              code: "AGENT_PROFILE_ID_CONFLICT",
              message: "A different Agent Profile with the same ID already exists.",
              profileId: profile.id,
            },
          };
    },

    async list() {
      const result = await options.pool.query<AgentProfileRow>(
        `SELECT profile_id, role, built_in, payload
         FROM storyrail.agent_profiles
         WHERE site_id = $1
         ORDER BY
           -- Built-ins read in the order the newsroom works, not alphabetically. The order comes
           -- from the role rather than from the identifier, because a Site created from the
           -- product mints its own identifiers and would otherwise sort as though its built-ins
           -- were somebody's custom Writers.
           CASE
             WHEN NOT built_in THEN 5
             WHEN role = 'researcher' THEN 1
             WHEN role = 'assignment_editor' THEN 2
             WHEN role = 'writer' THEN 3
             WHEN role = 'editor_in_chief' THEN 4
             ELSE 5
           END,
           payload ->> 'name' COLLATE "C" ASC,
           profile_id ASC`,
        [options.siteId],
      );
      return result.rows.map(decodePostgresAgentProfile);
    },
  };
}
