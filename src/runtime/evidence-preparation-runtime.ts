import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresSourceEvidencePreparationRepository } from "@/adapters/source-evidence-preparation-persistence";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence";
import {
  createPrepareSourceEvidence,
  type PrepareSourceEvidence,
} from "@/application/source-evidence-preparation";
import {
  OPENROUTER_API_KEY_SLOT,
  sourceEvidencePreparationId,
  type SiteId,
} from "@/domain/editorial";

import { createSiteStore } from "./site-store";
import {
  loadEvidencePreparationRuntimeConfiguration,
  type EvidencePreparationRuntimeConfiguration,
} from "./evidence-preparation-configuration";

export interface EvidencePreparationRuntime {
  readonly prepareSourceEvidence: PrepareSourceEvidence;
  close(): Promise<void>;
}

export interface CreateEvidencePreparationRuntimeOptions {
  readonly configuration: EvidencePreparationRuntimeConfiguration;
  readonly siteId: SiteId;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export function createEvidencePreparationRuntime(
  options: CreateEvidencePreparationRuntimeOptions,
): EvidencePreparationRuntime {
  const pool = (options.createPool ?? ((configuration) => new Pool(configuration)))({
    connectionString: options.configuration.databaseUrl,
  });
  const repositories = createPostgresSourceRepositories({ pool, siteId: options.siteId });
  const preparations = createPostgresSourceEvidencePreparationRepository({ pool });
  const createUuid = options.createUuid ?? randomUUID;
  const store = createSiteStore({
    pool,
    siteId: options.siteId,
    credentialKey: options.configuration.credentialKey,
  });
  const prepareSourceEvidence = createPrepareSourceEvidence({
    sources: repositories.sources,
    extractions: repositories.extractions,
    preparations,
    // The model this newsroom prepares evidence with, read when a preparation starts so a change
    // in the settings screen reaches the next Source rather than the next restart. The key is
    // resolved here, before anything is recorded, so a newsroom with none is told about the key
    // rather than shown a preparation that failed.
    resolveModel: async () => {
      const key = await store.resolveApiKey(OPENROUTER_API_KEY_SLOT);
      if (!key.ok) return { ok: false as const, error: key.error };
      return {
        ok: true as const,
        model: createOpenRouterStructuredModel({
          resolveApiKey: async () => key.apiKey,
          model: (await store.readModelIds()).evidencePreparation,
        }),
      };
    },
    createPreparationId: () => sourceEvidencePreparationId(createUuid()),
    now: options.now ?? (() => new Date().toISOString()),
  });
  let closePromise: Promise<void> | undefined;
  return Object.freeze({
    prepareSourceEvidence,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createEvidencePreparationRuntimeFromEnvironment(options: {
  readonly siteId: SiteId;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}): EvidencePreparationRuntime {
  return createEvidencePreparationRuntime({
    configuration: loadEvidencePreparationRuntimeConfiguration(options.environment),
    siteId: options.siteId,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
