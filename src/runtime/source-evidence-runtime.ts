import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createFirecrawlSourceExtractor } from "@/adapters/source-extraction";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence";
import { createRunSourceExtraction } from "@/application/source-extraction";
import {
  createExtractPersistedSource,
  createPreserveUrlSource,
  type ExtractPersistedSource,
  type PreserveUrlSource,
} from "@/application/source-evidence";
import { sourceExtractionId, sourceId } from "@/domain/editorial";

import {
  loadSourceEvidenceRuntimeConfiguration,
  type SourceEvidenceRuntimeConfiguration,
} from "./source-evidence-configuration";

export interface SourceEvidenceRuntime {
  readonly preserveUrlSource: PreserveUrlSource;
  readonly extractPersistedSource: ExtractPersistedSource;
  close(): Promise<void>;
}

export interface CreateSourceEvidenceRuntimeOptions {
  readonly configuration: SourceEvidenceRuntimeConfiguration;
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export interface CreateSourceEvidenceRuntimeFromEnvironmentOptions {
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
  const repositories = createPostgresSourceRepositories({ pool });
  const extractor = createFirecrawlSourceExtractor({
    apiKey: options.configuration.firecrawlApiKey,
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
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    preserveUrlSource,
    extractPersistedSource,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createSourceEvidenceRuntimeFromEnvironment(
  options: CreateSourceEvidenceRuntimeFromEnvironmentOptions = {},
): SourceEvidenceRuntime {
  const configuration = loadSourceEvidenceRuntimeConfiguration(options.environment);

  return createSourceEvidenceRuntime({
    configuration,
    fetch: options.fetch,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
