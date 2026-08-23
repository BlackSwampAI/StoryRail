import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentProfileRepository,
  AppendAgentProfileResult,
} from "@/application/agent-profiles";
import type { AgentProfile, AgentProfileId, SiteId } from "@/domain/editorial";

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
           -- Built-ins read in the order the newsroom works, not alphabetically.
           CASE profile_id
             WHEN 'storyrail-researcher-v1' THEN 1
             WHEN 'storyrail-assignment-editor-v1' THEN 2
             WHEN 'storyrail-general-writer-v1' THEN 3
             WHEN 'storyrail-director-v1' THEN 4
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
