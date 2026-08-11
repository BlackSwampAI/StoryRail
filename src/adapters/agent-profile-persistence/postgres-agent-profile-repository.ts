import { isDeepStrictEqual } from "node:util";

import type { Pool, QueryResultRow } from "pg";

import type {
  AgentProfileRepository,
  AppendAgentProfileResult,
} from "@/application/agent-profiles";
import type { AgentProfile, AgentProfileId } from "@/domain/editorial";

import {
  decodePostgresAgentProfile,
  PostgresAgentProfileInvariantError,
} from "./postgres-agent-profile-decoder";

interface AgentProfileRow extends QueryResultRow {
  readonly profile_id: unknown;
  readonly role: unknown;
  readonly built_in: unknown;
  readonly payload: unknown;
}

async function findById(pool: Pool, profileId: AgentProfileId): Promise<AgentProfile | null> {
  const result = await pool.query<AgentProfileRow>(
    `SELECT profile_id, role, built_in, payload
     FROM storyrail.agent_profiles
     WHERE profile_id = $1`,
    [profileId],
  );
  return result.rows[0] ? decodePostgresAgentProfile(result.rows[0]) : null;
}

export function createPostgresAgentProfileRepository(options: {
  readonly pool: Pool;
}): AgentProfileRepository {
  return {
    async append(profile): Promise<AppendAgentProfileResult> {
      const inserted = await options.pool.query<AgentProfileRow>(
        `INSERT INTO storyrail.agent_profiles (profile_id, role, built_in, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT DO NOTHING
         RETURNING profile_id, role, built_in, payload`,
        [profile.id, profile.role, profile.builtIn, JSON.stringify(profile)],
      );
      if (inserted.rows[0]) {
        return { ok: true, profile: decodePostgresAgentProfile(inserted.rows[0]) };
      }

      const existing = await findById(options.pool, profile.id);
      if (!existing) throw new PostgresAgentProfileInvariantError();
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
         ORDER BY
           CASE profile_id
             WHEN 'storyrail-assignment-editor-v1' THEN 1
             WHEN 'storyrail-general-writer-v1' THEN 2
             WHEN 'storyrail-director-v1' THEN 3
             ELSE 4
           END,
           payload ->> 'name' COLLATE "C" ASC,
           profile_id ASC`,
      );
      return result.rows.map(decodePostgresAgentProfile);
    },
  };
}
