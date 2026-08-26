import { randomUUID } from "node:crypto";

import { Pool, type PoolConfig } from "pg";

import { createPostgresAgentRunRepository } from "@/adapters/agent-run-persistence";
import { createPostgresAgentToolCallRepository } from "@/adapters/agent-tool-call-persistence";
import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";
import { createPostgresPolicyRunRepository } from "@/adapters/policy-run-persistence";
import { createSetNewsroomStandards } from "@/application/newsroom-standards";
import { createReconcileAbandonedWork } from "@/application/policy-runs";
import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAssignmentPersistence } from "@/adapters/assignment-persistence";
import {
  createPostgresReviewDecisionPersistence,
  createPostgresReviewSubmissionPersistence,
} from "@/adapters/review-persistence";
import { createPostgresStoryListingRepository } from "@/adapters/story-listing";
import { createPostgresStoryRepository } from "@/adapters/story-persistence";
import { createPostgresStoryPublicationPersistence } from "@/adapters/story-publication-persistence";
import { createPostgresStoryDeliveryRepository } from "@/adapters/story-delivery-persistence";
import { createSiteDeliveryDestinationDirectory } from "@/adapters/story-delivery";
import { createPostgresStoryRejectionPersistence } from "@/adapters/story-rejection-persistence";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence";
import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import { createPostgresSiteCredentialRepository } from "@/adapters/site-credential-persistence";
import { createPostgresSiteSettingsRepository } from "@/adapters/site-settings-persistence";
import {
  createSetSiteCredential,
  type SetSiteCredentialWorkflow,
} from "@/application/site-credentials";
import {
  createUpdateSiteSettings,
  type UpdateSiteSettingsWorkflow,
} from "@/application/site-settings";
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
import { createPublishStory, type PublishStoryWorkflow } from "@/application/story-publications";
import {
  createDeliverStory,
  type DeliverStoryWorkflow,
  type StoryDeliveryRepository,
} from "@/application/story-deliveries";
import { createRejectStory, type RejectStoryWorkflow } from "@/application/story-rejections";
import {
  createSubmitStoryReview,
  type SubmitStoryReviewResult,
} from "@/application/review-submissions";
import {
  createRecordStoryReviewDecision,
  type RecordStoryReviewDecisionResult,
} from "@/application/review-decisions";
import type { StoryInspectionRepository } from "@/application/story-inspection";
import type { StoryListingRepository } from "@/application/story-listing";
import {
  createAttachSourceToStory,
  type AttachSourceToStoryWorkflow,
} from "@/application/story-source-attachment";
import {
  agentProfileId,
  assignmentId,
  reviewDecisionId,
  storyDeliveryId,
  storyId,
  transitionId,
  type AgentRunId,
  type OperatorActor,
  type ReviewDecisionValue,
  type CredentialSlot,
  type SiteId,
} from "@/domain/editorial";

import { resolveCredentialKey } from "./credential-configuration";
import { createSiteStore, DEFAULT_SITE_MODEL_IDS } from "./site-store";

export interface StoryRuntime {
  readonly listNewsroomStandards: import("@/application/newsroom-standards").NewsroomStandardsRepository["list"];
  readonly setNewsroomStandards: ReturnType<
    typeof import("@/application/newsroom-standards").createSetNewsroomStandards
  >;
  readonly policyRuns: import("@/application/policy-runs").PolicyRunRepository;
  readonly reconcileAbandonedWork: () => Promise<
    import("@/application/policy-runs").ReconciliationReport
  >;
  readonly createStory: CreateStoryWorkflow;
  readonly attachSourceToStory: AttachSourceToStoryWorkflow;
  readonly inspectStory: StoryInspectionRepository["inspect"];
  readonly listStories: StoryListingRepository["list"];
  readonly listPendingSources: SourceInboxRepository["listPending"];
  readonly recordSourceTriageDecision: RecordSourceTriageDecisionWorkflow;
  readonly createCustomWriterProfile: CreateCustomWriterProfileWorkflow;
  readonly listAgentProfiles: AgentProfileRepository["list"];
  readonly assignStory: AssignStoryWorkflow;
  readonly rejectStory: RejectStoryWorkflow;
  readonly publishStory: PublishStoryWorkflow;
  readonly deliverStory: DeliverStoryWorkflow;
  readonly listStoryDeliveries: StoryDeliveryRepository["listByStoryId"];
  readonly submitStoryReview: (command: {
    readonly storyId: import("@/domain/editorial").StoryId;
    readonly submittedBy: OperatorActor;
  }) => Promise<SubmitStoryReviewResult>;
  readonly readSiteSettings: () => Promise<{
    readonly settings: import("@/domain/editorial").SiteSettings;
    readonly credentials: readonly import("@/domain/editorial").ConfiguredCredential[];
  }>;
  readonly updateSiteSettings: UpdateSiteSettingsWorkflow;
  readonly setSiteCredential: SetSiteCredentialWorkflow;
  readonly removeSiteCredential: (
    slot: import("@/domain/editorial").CredentialSlot,
  ) => Promise<boolean>;
  readonly recordStoryReviewDecision: (command: {
    readonly storyId: import("@/domain/editorial").StoryId;
    readonly directorRunId: AgentRunId;
    readonly decision: ReviewDecisionValue;
    readonly reason: string;
    readonly decidedBy: OperatorActor;
  }) => Promise<RecordStoryReviewDecisionResult>;
  close(): Promise<void>;
}

export interface CreateStoryRuntimeOptions {
  readonly databaseUrl: string;
  readonly siteId: SiteId;
  /** Null when no key is set, which is an installation that has stored no credentials yet. */
  readonly credentialKey?: string | null;
  readonly now?: () => string;
  readonly createUuid?: () => string;
  readonly createPool?: (configuration: PoolConfig) => Pool;
}

export interface CreateStoryRuntimeFromEnvironmentOptions {
  readonly siteId: SiteId;
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
  const { siteId: site } = options;
  const storyRepository = createPostgresStoryRepository({ pool, siteId: site });
  const attachmentRepository = createPostgresStorySourceAttachmentRepository({
    pool,
    siteId: site,
  });
  const inspectionRepository = createPostgresStoryInspectionRepository({ pool, siteId: site });
  const listingRepository = createPostgresStoryListingRepository({ pool, siteId: site });
  const sourceInboxRepository = createPostgresSourceInboxRepository({ pool, siteId: site });
  const sourceTriageRepository = createPostgresSourceTriageDecisionRepository({
    pool,
    siteId: site,
  });
  const agentProfileRepository = createPostgresAgentProfileRepository({ pool, siteId: site });
  const assignmentPersistence = createPostgresAssignmentPersistence({ pool, siteId: site });
  const reviewSubmissionPersistence = createPostgresReviewSubmissionPersistence({ pool });
  const reviewDecisionPersistence = createPostgresReviewDecisionPersistence({ pool });
  const storyRejectionPersistence = createPostgresStoryRejectionPersistence({ pool });
  const storyPublicationPersistence = createPostgresStoryPublicationPersistence({ pool });
  const newsroomStandards = createPostgresNewsroomStandardsRepository({ pool, siteId: site });
  const setNewsroomStandards = createSetNewsroomStandards({
    repository: newsroomStandards,
    createUuid,
    now,
  });
  const policyRuns = createPostgresPolicyRunRepository({ pool, siteId: site });
  const reconcileAbandonedWork = createReconcileAbandonedWork({
    policyRuns,
    agentRuns: createPostgresAgentRunRepository({ pool }),
    toolCalls: createPostgresAgentToolCallRepository({ pool }),
    now,
  });
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
  const submitStoryReview = createSubmitStoryReview({
    inspections: inspectionRepository,
    persistence: reviewSubmissionPersistence,
    createTransitionId: () => transitionId(createUuid()),
    now,
  });
  const recordStoryReviewDecision = createRecordStoryReviewDecision({
    inspections: inspectionRepository,
    persistence: reviewDecisionPersistence,
    createDecisionId: () => reviewDecisionId(createUuid()),
    createTransitionId: () => transitionId(createUuid()),
    now,
  });
  const rejectStory = createRejectStory({
    inspections: inspectionRepository,
    persistence: storyRejectionPersistence,
    createTransitionId: () => transitionId(createUuid()),
    now,
  });
  const publishStory = createPublishStory({
    inspections: inspectionRepository,
    persistence: storyPublicationPersistence,
    createTransitionId: () => transitionId(createUuid()),
    now,
  });
  const siteCredentials = createPostgresSiteCredentialRepository({ pool, siteId: site });
  const siteSettings = createPostgresSiteSettingsRepository({ pool, siteId: site });
  const siteStore = createSiteStore({
    pool,
    siteId: site,
    credentialKey: options.credentialKey ?? null,
  });
  const storyDeliveries = createPostgresStoryDeliveryRepository({ pool });
  const deliverStory = createDeliverStory({
    inspections: inspectionRepository,
    deliveries: storyDeliveries,
    destinations: createSiteDeliveryDestinationDirectory({
      settings: siteSettings,
      resolveApiKey: siteStore.resolveApiKey,
    }),
    createDeliveryId: () => storyDeliveryId(createUuid()),
    now,
  });
  const setSiteCredential = createSetSiteCredential({
    credentials: siteCredentials,
    siteId: site,
    cipher: options.credentialKey
      ? createAesGcmCredentialCipher({ key: options.credentialKey })
      : null,
    now,
  });
  const updateSiteSettings = createUpdateSiteSettings({ settings: siteSettings, now });
  let closePromise: Promise<void> | undefined;

  return Object.freeze({
    listNewsroomStandards: () => newsroomStandards.list(),
    setNewsroomStandards,
    policyRuns,
    reconcileAbandonedWork,
    createStory,
    attachSourceToStory,
    inspectStory,
    listStories,
    listPendingSources,
    recordSourceTriageDecision,
    createCustomWriterProfile,
    listAgentProfiles,
    assignStory,
    rejectStory,
    publishStory,
    deliverStory,
    listStoryDeliveries: (identity: import("@/domain/editorial").StoryId) =>
      storyDeliveries.listByStoryId(identity),
    submitStoryReview,
    // Settings and the list of configured credentials are read together because they are one
    // screen. The credentials half carries hints and never ciphertext, which is a property of
    // the query rather than of this method remembering to strip anything.
    async readSiteSettings() {
      const [stored, credentials] = await Promise.all([
        siteSettings.find(),
        siteCredentials.listConfigured(),
      ]);
      return {
        settings: stored ?? { models: DEFAULT_SITE_MODEL_IDS, destination: null, search: null },
        credentials,
      };
    },
    updateSiteSettings,
    setSiteCredential,
    removeSiteCredential: (slot: CredentialSlot) => siteCredentials.remove(slot),
    recordStoryReviewDecision,
    close() {
      closePromise ??= Promise.resolve().then(() => pool.end());
      return closePromise;
    },
  });
}

export function createStoryRuntimeFromEnvironment(
  options: CreateStoryRuntimeFromEnvironmentOptions,
): StoryRuntime {
  const databaseUrl = (options.environment ?? process.env).STORYRAIL_DATABASE_URL;

  if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
    throw new StoryRuntimeConfigurationError();
  }

  return createStoryRuntime({
    databaseUrl,
    siteId: options.siteId,
    credentialKey: resolveCredentialKey(options.environment ?? process.env),
    now: options.now,
    createUuid: options.createUuid,
    createPool: options.createPool,
  });
}
