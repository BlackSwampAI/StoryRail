import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAssignmentPersistence } from "@/adapters/assignment-persistence";
import { createPostgresStoryListingRepository } from "@/adapters/story-listing";
import { createPostgresStoryRepository } from "@/adapters/story-persistence";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence";
import { createPostgresSourceInboxRepository } from "@/adapters/source-inbox";
import { createPostgresSourceTriageDecisionRepository } from "@/adapters/source-triage-persistence";
import type { SourceInboxRepository } from "@/application/source-inbox";
import { createAssignStory, type AssignStoryWorkflow } from "@/application/assignments";
import {
  createCreateCustomWriterProfile,
  type AgentProfileRepository,
  type CreateCustomWriterProfileWorkflow,
} from "@/application/agent-profiles";
import {
  createRecordSourceTriageDecision,
  type RecordSourceTriageDecisionWorkflow,
} from "@/application/source-triage";
import { createCreateStory, type CreateStoryWorkflow } from "@/application/story-creation";
import type { StoryInspectionRepository } from "@/application/story-inspection";
import type { StoryListingRepository } from "@/application/story-listing";
import {
  createAttachSourceToStory,
  type AttachSourceToStoryWorkflow,
} from "@/application/story-source-attachment";
import { agentProfileId, assignmentId, storyId, transitionId } from "@/domain/editorial";

export interface StoryRuntime {
  readonly createStory: CreateStoryWorkflow;
  readonly attachSourceToStory: AttachSourceToStoryWorkflow;
  readonly inspectStory: StoryInspectionRepository["inspect"];
  readonly listStories: StoryListingRepository["list"];
  readonly listPendingSources: SourceInboxRepository["listPending"];
  readonly recordSourceTriageDecision: RecordSourceTriageDecisionWorkflow;
  readonly createCustomWriterProfile: CreateCustomWriterProfileWorkflow;
  readonly listAgentProfiles: AgentProfileRepository["list"];
  readonly assignStory: AssignStoryWorkflow;
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
  const listingRepository = createPostgresStoryListingRepository({ pool });
  const sourceInboxRepository = createPostgresSourceInboxRepository({ pool });
  const sourceTriageRepository = createPostgresSourceTriageDecisionRepository({ pool });
  const agentProfileRepository = createPostgresAgentProfileRepository({ pool });
  const assignmentPersistence = createPostgresAssignmentPersistence({ pool });
  const createStory = createCreateStory({
    storyRepository,
    createStoryId: () => storyId(createUuid()),
    now,
  });
  const attachSourceToStory = createAttachSourceToStory({ attachmentRepository, now });
  const inspectStory: StoryInspectionRepository["inspect"] = (identity) =>
    inspectionRepository.inspect(identity);
  const listStories: StoryListingRepository["list"] = () => listingRepository.list();
  const listPendingSources: SourceInboxRepository["listPending"] = () =>
    sourceInboxRepository.listPending();
  const recordSourceTriageDecision = createRecordSourceTriageDecision({
    repository: sourceTriageRepository,
    now,
  });
  const createCustomWriterProfile = createCreateCustomWriterProfile({
    repository: agentProfileRepository,
    createAgentProfileId: () => agentProfileId(createUuid()),
  });
  const listAgentProfiles: AgentProfileRepository["list"] = () => agentProfileRepository.list();
  const assignStory = createAssignStory({
    storyRepository,
    agentProfileRepository,
    inspectionRepository,
    assignmentPersistence,
    createAssignmentId: () => assignmentId(createUuid()),
    createTransitionId: () => transitionId(createUuid()),
    now,
  });
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    createStory,
    attachSourceToStory,
    inspectStory,
    listStories,
    listPendingSources,
    recordSourceTriageDecision,
    createCustomWriterProfile,
    listAgentProfiles,
    assignStory,
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
