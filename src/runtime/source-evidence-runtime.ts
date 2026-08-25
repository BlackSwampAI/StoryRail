import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createFirecrawlSourceExtractor } from "@/adapters/source-extraction";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence";
import { createRunSourceExtraction } from "@/application/source-extraction";
import {
  createExtractPersistedSource,
  createPreserveAndExtractUrlSource,
  createPreserveUrlSource,
  type ExtractPersistedSource,
  type PreserveAndExtractUrlSource,
  type PreserveUrlSource,
} from "@/application/source-evidence";
import {
  FIRECRAWL_API_KEY_SLOT,
  sourceExtractionId,
  sourceId,
  type SiteId,
} from "@/domain/editorial";

import { createSiteStore } from "./site-store";
import {
  loadSourceEvidenceRuntimeConfiguration,
  type SourceEvidenceRuntimeConfiguration,
} from "./source-evidence-configuration";

export interface SourceEvidenceRuntime {
  readonly preserveUrlSource: PreserveUrlSource;
  readonly extractPersistedSource: ExtractPersistedSource;
  readonly preserveAndExtractUrlSource: PreserveAndExtractUrlSource;
  close(): Promise<void>;
}

export interface CreateSourceEvidenceRuntimeOptions {
  readonly configuration: SourceEvidenceRuntimeConfiguration;
  readonly siteId: SiteId;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export interface CreateSourceEvidenceRuntimeFromEnvironmentOptions {
  readonly siteId: SiteId;
  readonly environment?: NodeJS.ProcessEnv;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export function createSourceEvidenceRuntime(
  options: CreateSourceEvidenceRuntimeOptions,
): SourceEvidenceRuntime {
  const createPool = options.createPool ?? ((configuration: PoolConfig) => new Pool(configuration));
  const createUuid = options.createUuid ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const pool = createPool({ connectionString: options.configuration.databaseUrl });
  const repositories = createPostgresSourceRepositories({ pool, siteId: options.siteId });
  const store = createSiteStore({
    pool,
    siteId: options.siteId,
    credentialKey: options.configuration.credentialKey,
  });
  const extractor = createFirecrawlSourceExtractor({
    resolveApiKey: () => store.resolveApiKey(FIRECRAWL_API_KEY_SLOT),
    fetch: options.fetch ?? globalThis.fetch,
  });
  const runSourceExtraction = createRunSourceExtraction({
    extractor,
    createExtractionId: () => sourceExtractionId(createUuid()),
    now,
  });
  const preserveUrlSource = createPreserveUrlSource({
    sourceRepository: repositories.sources,
    createSourceId: () => sourceId(createUuid()),
    now,
  });
  const extractPersistedSource = createExtractPersistedSource({
    sourceRepository: repositories.sources,
    extractionRepository: repositories.extractions,
    runSourceExtraction,
  });
  const preserveAndExtractUrlSource = createPreserveAndExtractUrlSource({
    preserveUrlSource,
    extractPersistedSource,
  });
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    preserveUrlSource,
    extractPersistedSource,
    preserveAndExtractUrlSource,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createSourceEvidenceRuntimeFromEnvironment(
  options: CreateSourceEvidenceRuntimeFromEnvironmentOptions,
): SourceEvidenceRuntime {
  const configuration = loadSourceEvidenceRuntimeConfiguration(options.environment);

  return createSourceEvidenceRuntime({
    configuration,
    siteId: options.siteId,
    fetch: options.fetch,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
