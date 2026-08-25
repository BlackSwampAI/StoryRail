import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresSiteRepository } from "@/adapters/site-persistence";
import { createCreateSite, type CreateSiteWorkflow } from "@/application/sites";
import type { Site, SiteId } from "@/domain/editorial";

import { StoryRuntimeConfigurationError } from "./story-runtime";

/**
 * The one composition root that is not scoped to a Site, because it is what decides which Sites
 * there are. Everything else in `src/runtime` is handed a Site and can never see another's work;
 * this reads and writes the table that names them.
 */
export interface SiteDirectoryRuntime {
  readonly findSite: (id: SiteId) => Promise<Site | null>;
  readonly listSites: () => Promise<readonly Site[]>;
  readonly createSite: CreateSiteWorkflow;
  close(): Promise<void>;
}

export interface CreateSiteDirectoryRuntimeOptions {
  readonly databaseUrl: string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export function createSiteDirectoryRuntime(
  options: CreateSiteDirectoryRuntimeOptions,
): SiteDirectoryRuntime {
  const createPool = options.createPool ?? ((configuration: PoolConfig) => new Pool(configuration));
  const pool = createPool({ connectionString: options.databaseUrl });
  const sites = createPostgresSiteRepository({ pool });
  const createSite = createCreateSite({ sites, createUuid: options.createUuid ?? randomUUID });
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    findSite: (id: SiteId) => sites.findById(id),
    listSites: () => sites.list(),
    createSite,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createSiteDirectoryRuntimeFromEnvironment(
  options: {
    readonly environment?: Readonly<Partial<NodeJS.ProcessEnv>>;
    readonly createUuid?: () => string;
    readonly createPool?: (configuration: PoolConfig) => Pool;
  } = {},
): SiteDirectoryRuntime {
  const databaseUrl = (options.environment ?? process.env).STORYRAIL_DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new StoryRuntimeConfigurationError();
  }

  return createSiteDirectoryRuntime({
    databaseUrl,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
