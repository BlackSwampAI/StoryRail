import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createOpenRouterStructuredModel } from "@/adapters/model";
import { createPostgresSourceEvidencePreparationRepository } from "@/adapters/source-evidence-preparation-persistence";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence";
import {
  createPrepareSourceEvidence,
  type PrepareSourceEvidence,
} from "@/application/source-evidence-preparation";
import { sourceEvidencePreparationId, type SiteId } from "@/domain/editorial";

import { resolveSiteId } from "./site-configuration";
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
  const model = createOpenRouterStructuredModel({
    apiKey: options.configuration.openRouterApiKey,
    model: options.configuration.model,
  });
  const prepareSourceEvidence = createPrepareSourceEvidence({
    sources: repositories.sources,
    extractions: repositories.extractions,
    preparations,
    model,
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

export function createEvidencePreparationRuntimeFromEnvironment(
  options: {
    readonly environment?: NodeJS.ProcessEnv;
    readonly now?: () => string;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): EvidencePreparationRuntime {
  return createEvidencePreparationRuntime({
    configuration: loadEvidencePreparationRuntimeConfiguration(options.environment),
    siteId: resolveSiteId(options.environment ?? process.env),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
