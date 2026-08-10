import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { createPostgresStoryRepository } from "@/adapters/story-persistence";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence";
import { createCreateStory, type CreateStoryWorkflow } from "@/application/story-creation";
import type { StoryInspectionRepository } from "@/application/story-inspection";
import {
  createAttachSourceToStory,
  type AttachSourceToStoryWorkflow,
} from "@/application/story-source-attachment";
import { storyId } from "@/domain/editorial";

export interface StoryRuntime {
  readonly createStory: CreateStoryWorkflow;
  readonly attachSourceToStory: AttachSourceToStoryWorkflow;
  readonly inspectStory: StoryInspectionRepository["inspect"];
  close(): Promise<void>;
}

export interface CreateStoryRuntimeOptions {
  readonly databaseUrl: string;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export interface CreateStoryRuntimeFromEnvironmentOptions {
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export class StoryRuntimeConfigurationError extends Error {
  readonly code = "STORYRAIL_DATABASE_URL_REQUIRED";

  constructor() {
    super("STORYRAIL_DATABASE_URL is required.");
    this.name = "StoryRuntimeConfigurationError";
  }
}

export function createStoryRuntime(options: CreateStoryRuntimeOptions): StoryRuntime {
  const createPool = options.createPool ?? ((configuration: PoolConfig) => new Pool(configuration));
  const createUuid = options.createUuid ?? randomUUID;
  const now = options.now ?? (() => new Date().toISOString());
  const pool = createPool({ connectionString: options.databaseUrl });
  const storyRepository = createPostgresStoryRepository({ pool });
  const attachmentRepository = createPostgresStorySourceAttachmentRepository({ pool });
  const inspectionRepository = createPostgresStoryInspectionRepository({ pool });
  const createStory = createCreateStory({
    storyRepository,
    createStoryId: () => storyId(createUuid()),
    now,
  });
  const attachSourceToStory = createAttachSourceToStory({ attachmentRepository, now });
  const inspectStory: StoryInspectionRepository["inspect"] = (identity) =>
    inspectionRepository.inspect(identity);
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    createStory,
    attachSourceToStory,
    inspectStory,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createStoryRuntimeFromEnvironment(
  options: CreateStoryRuntimeFromEnvironmentOptions = {},
): StoryRuntime {
  const databaseUrl = (options.environment ?? process.env).STORYRAIL_DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new StoryRuntimeConfigurationError();
  }

  return createStoryRuntime({
    databaseUrl,
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
