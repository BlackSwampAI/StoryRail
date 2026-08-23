import type { Pool } from "pg";

import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import { createPostgresSiteCredentialRepository } from "@/adapters/site-credential-persistence";
import { createPostgresSiteSettingsRepository } from "@/adapters/site-settings-persistence";
import { createResolveCredential, type CredentialCipher } from "@/application/site-credentials";
import type { ApiKeyResolution, CredentialSlot, SiteId, SiteModelIds } from "@/domain/editorial";

/**
 * The models an installation ships with, used until a newsroom chooses its own.
 *
 * They live here rather than in the environment because a model identifier is a per-Site choice
 * now, and an installation that reads one from `.env` would silently override what an operator
 * selected in the settings screen.
 */
export const DEFAULT_SITE_MODEL_IDS: SiteModelIds = Object.freeze({
  evidencePreparation: "google/gemini-3.7-flash",
  assignmentEditor: "google/gemini-3.7-flash",
  writer: "google/gemini-3.7-flash",
  director: "google/gemini-3.7-flash",
  researcher: "google/gemini-3.7-flash",
});

export interface SiteStore {
  readonly resolveApiKey: (slot: CredentialSlot) => Promise<ApiKeyResolution>;
  readonly readModelIds: () => Promise<SiteModelIds>;
}

/**
 * Everything a runtime needs from the per-Site store, wired as resolvers.
 *
 * Nothing here reads the database while it is being built. A runtime provider caches the runtime
 * it constructs for the life of the process, so a value fetched now would outlive every edit an
 * operator makes to it.
 */
export function createSiteStore(options: {
  readonly pool: Pool;
  readonly siteId: SiteId;
  readonly credentialKey: string | null;
  readonly createCipher?: (key: string) => CredentialCipher;
}): SiteStore {
  const cipher = options.credentialKey
    ? (options.createCipher ?? ((key) => createAesGcmCredentialCipher({ key })))(
        options.credentialKey,
      )
    : null;
  const resolveCredential = createResolveCredential({
    credentials: createPostgresSiteCredentialRepository({
      pool: options.pool,
      siteId: options.siteId,
    }),
    siteId: options.siteId,
    cipher,
  });
  const settings = createPostgresSiteSettingsRepository({
    pool: options.pool,
    siteId: options.siteId,
  });

  return Object.freeze({
    // A result rather than a thrown error, because the caller has to be able to answer with the
    // credential instead of recording work that never happened.
    async resolveApiKey(slot: CredentialSlot): Promise<ApiKeyResolution> {
      const resolved = await resolveCredential(slot);
      return resolved.ok ? { ok: true, apiKey: resolved.secret } : resolved;
    },

    async readModelIds(): Promise<SiteModelIds> {
      // A Site with no settings row is a Site nobody has configured yet, not a broken one, so it
      // runs on what the installation shipped with rather than refusing to run.
      return (await settings.find())?.models ?? DEFAULT_SITE_MODEL_IDS;
    },
  });
}
