// @vitest-environment node

import type { Pool, PoolConfig } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { siteId } from "@/domain/editorial";
import { createPostgresAgentProfileRepository } from "@/adapters/agent-profile-persistence";
import { createPostgresAssignmentPersistence } from "@/adapters/assignment-persistence";
import { createPostgresStoryListingRepository } from "@/adapters/story-listing";
import { createPostgresStoryRepository } from "@/adapters/story-persistence";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence";
import { createPostgresSourceInboxRepository } from "@/adapters/source-inbox";
import { createPostgresSourceTriageDecisionRepository } from "@/adapters/source-triage-persistence";
import type { SourceInboxRepository } from "@/application/source-inbox";
import type { AgentProfileRepository } from "@/application/agent-profiles";
import type { AssignmentPersistence } from "@/application/assignments";
import type { SourceTriageDecisionRepository } from "@/application/source-triage";
import type { StoryInspectionRepository } from "@/application/story-inspection";
import type { StoryListingRepository } from "@/application/story-listing";
import type { StoryRepository } from "@/application/story-persistence";
import type { StorySourceAttachmentRepository } from "@/application/story-source-persistence";
import { operatorId, sourceId, storyId } from "@/domain/editorial";

import {
  createStoryRuntime,
  createStoryRuntimeFromEnvironment,
  StoryRuntimeConfigurationError,
} from "./story-runtime";

const factoryMocks = vi.hoisted(() => ({
  createStoryRepository: vi.fn(),
  createAttachmentRepository: vi.fn(),
  createInspectionRepository: vi.fn(),
  createListingRepository: vi.fn(),
  createSourceInboxRepository: vi.fn(),
  createSourceTriageRepository: vi.fn(),
  createAgentProfileRepository: vi.fn(),
  createAssignmentPersistence: vi.fn(),
}));

vi.mock("@/adapters/story-persistence", () => ({
  createPostgresStoryRepository: factoryMocks.createStoryRepository,
}));

vi.mock("@/adapters/story-source-persistence", () => ({
  createPostgresStorySourceAttachmentRepository: factoryMocks.createAttachmentRepository,
}));

vi.mock("@/adapters/story-inspection", () => ({
  createPostgresStoryInspectionRepository: factoryMocks.createInspectionRepository,
}));

vi.mock("@/adapters/story-listing", () => ({
  createPostgresStoryListingRepository: factoryMocks.createListingRepository,
}));

vi.mock("@/adapters/source-inbox", () => ({
  createPostgresSourceInboxRepository: factoryMocks.createSourceInboxRepository,
}));

vi.mock("@/adapters/source-triage-persistence", () => ({
  createPostgresSourceTriageDecisionRepository: factoryMocks.createSourceTriageRepository,
}));

vi.mock("@/adapters/agent-profile-persistence", () => ({
  createPostgresAgentProfileRepository: factoryMocks.createAgentProfileRepository,
}));

vi.mock("@/adapters/assignment-persistence", () => ({
  createPostgresAssignmentPersistence: factoryMocks.createAssignmentPersistence,
}));

const SITE = siteId("site-default");
const DATABASE_URL = "opaque-story-runtime-database-configuration";
const STORY_UUID = "40000000-0000-4000-8000-000000000020";
const SOURCE_ID = sourceId("source-runtime-0020");
const CREATED_AT = "2026-08-09T12:00:00.000Z";
const ATTACHED_AT = "2026-08-09T12:01:00.000Z";
const OPERATOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-runtime-0020"),
} as const);

interface ControlledPool {
  readonly pool: Pool;
  readonly query: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function makePool(end: () => Promise<void> = async () => undefined): ControlledPool {
  const query = vi.fn();
  const endMock = vi.fn(end);
  return {
    pool: { query, end: endMock } as unknown as Pool,
    query,
    end: endMock,
  };
}

function makeRepositories() {
  const storyRepository: StoryRepository = {
    findById: vi.fn<StoryRepository["findById"]>(async () => null),
    persist: vi.fn<StoryRepository["persist"]>(async ({ story }) => ({ ok: true, story })),
  };
  const attachmentRepository: StorySourceAttachmentRepository = {
    attach: vi.fn<StorySourceAttachmentRepository["attach"]>(async ({ attachment }) => ({
      ok: true,
      attachment,
    })),
  };
  const inspectionRepository: StoryInspectionRepository = {
    inspect: vi.fn<StoryInspectionRepository["inspect"]>(async (identity) => ({
      ok: false,
      error: {
        code: "STORY_NOT_FOUND",
        message: "The Story to inspect does not exist.",
        storyId: identity,
      },
    })),
  };
  const listingRepository: StoryListingRepository = {
    list: vi.fn<StoryListingRepository["list"]>(async () => []),
  };
  const sourceInboxRepository: SourceInboxRepository = {
    listPending: vi.fn<SourceInboxRepository["listPending"]>(async () => []),
  };
  const sourceTriageRepository: SourceTriageDecisionRepository = {
    findBySourceId: vi.fn<SourceTriageDecisionRepository["findBySourceId"]>(async () => null),
    record: vi.fn<SourceTriageDecisionRepository["record"]>(async (triageDecision) => ({
      ok: true,
      triageDecision,
    })),
  };
  const agentProfileRepository: AgentProfileRepository = {
    findById: vi.fn<AgentProfileRepository["findById"]>(async () => null),
    findBuiltIn: vi.fn<AgentProfileRepository["findBuiltIn"]>(async () => null),
    append: vi.fn<AgentProfileRepository["append"]>(async (profile) => ({ ok: true, profile })),
    list: vi.fn<AgentProfileRepository["list"]>(async () => []),
  };
  const assignmentPersistence: AssignmentPersistence = {
    persist: vi.fn<AssignmentPersistence["persist"]>(),
  };

  return {
    storyRepository,
    attachmentRepository,
    inspectionRepository,
    listingRepository,
    sourceInboxRepository,
    sourceTriageRepository,
    agentProfileRepository,
    assignmentPersistence,
  };
}

beforeEach(() => {
  for (const factory of Object.values(factoryMocks)) {
    factory.mockReset();
  }
  const repositories = makeRepositories();
  factoryMocks.createStoryRepository.mockReturnValue(repositories.storyRepository);
  factoryMocks.createAttachmentRepository.mockReturnValue(repositories.attachmentRepository);
  factoryMocks.createInspectionRepository.mockReturnValue(repositories.inspectionRepository);
  factoryMocks.createListingRepository.mockReturnValue(repositories.listingRepository);
  factoryMocks.createSourceInboxRepository.mockReturnValue(repositories.sourceInboxRepository);
  factoryMocks.createSourceTriageRepository.mockReturnValue(repositories.sourceTriageRepository);
  factoryMocks.createAgentProfileRepository.mockReturnValue(repositories.agentProfileRepository);
  factoryMocks.createAssignmentPersistence.mockReturnValue(repositories.assignmentPersistence);
});

describe("createStoryRuntime", () => {
  it("owns one inert Pool and composes all Story PostgreSQL adapters", () => {
    const controlledPool = makePool();
    const createPool = vi.fn<(configuration: PoolConfig) => Pool>(() => controlledPool.pool);
    const createUuid = vi.fn(() => STORY_UUID);
    const now = vi.fn(() => CREATED_AT);
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
      siteId: SITE,
      createPool,
      createUuid,
      now,
    });

    expect(createPool).toHaveBeenCalledOnce();
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(createPostgresStoryRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresStorySourceAttachmentRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresStoryInspectionRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresStoryListingRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresSourceInboxRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresSourceTriageDecisionRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresAgentProfileRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createPostgresAssignmentPersistence).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(controlledPool.query).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(controlledPool.end).not.toHaveBeenCalled();
    expect(Object.keys(runtime)).toEqual([
      "listNewsroomStandards",
      "setNewsroomStandards",
      "policyRuns",
      "reconcileAbandonedWork",
      "createStory",
      "attachSourceToStory",
      "inspectStory",
      "listStories",
      "listPendingSources",
      "recordSourceTriageDecision",
      "createCustomWriterProfile",
      "listAgentProfiles",
      "assignStory",
      "rejectStory",
      "publishStory",
      "deliverStory",
      "resolveLegacyDeliveryMapping",
      "listStoryDeliveries",
      "submitStoryReview",
      "readSiteSettings",
      "updateSiteSettings",
      "setSiteCredential",
      "removeSiteCredential",
      "recordStoryReviewDecision",
      "close",
    ]);
    expect(JSON.stringify(runtime)).not.toContain(DATABASE_URL);
  });

  it("supplies UUID identities and ISO clock values to the database-only workflows", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createStoryRepository.mockReturnValue(repositories.storyRepository);
    factoryMocks.createAttachmentRepository.mockReturnValue(repositories.attachmentRepository);
    factoryMocks.createInspectionRepository.mockReturnValue(repositories.inspectionRepository);
    factoryMocks.createListingRepository.mockReturnValue(repositories.listingRepository);
    factoryMocks.createAgentProfileRepository.mockReturnValue(repositories.agentProfileRepository);
    factoryMocks.createAssignmentPersistence.mockReturnValue(repositories.assignmentPersistence);
    const createUuid = vi
      .fn<() => string>()
      .mockReturnValueOnce(STORY_UUID)
      .mockReturnValueOnce("40000000-0000-4000-8000-000000000027");
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce(CREATED_AT)
      .mockReturnValueOnce(ATTACHED_AT);
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
      siteId: SITE,
      createPool: () => controlledPool.pool,
      createUuid,
      now,
    });

    const createResult = await runtime.createStory({ title: " Runtime-composed Story " });
    const attachmentResult = await runtime.attachSourceToStory({
      storyId: storyId(STORY_UUID),
      sourceId: SOURCE_ID,
      relevance: " Primary runtime evidence. ",
      attachedBy: OPERATOR,
    });
    const inspectionResult = await runtime.inspectStory(storyId(STORY_UUID));
    const listingResult = await runtime.listStories();
    const profileResult = await runtime.createCustomWriterProfile({
      name: "Runtime Writer",
      instructions: "Stay grounded.",
      model: null,
    });
    const profiles = await runtime.listAgentProfiles();

    expect(createResult).toMatchObject({
      ok: true,
      story: {
        id: storyId(STORY_UUID),
        title: "Runtime-composed Story",
        createdAt: CREATED_AT,
      },
    });
    expect(repositories.storyRepository.persist).toHaveBeenCalledWith({
      story: expect.objectContaining({ id: storyId(STORY_UUID), createdAt: CREATED_AT }),
    });
    expect(attachmentResult).toMatchObject({
      ok: true,
      attachment: { relevance: "Primary runtime evidence.", attachedAt: ATTACHED_AT },
    });
    expect(repositories.attachmentRepository.attach).toHaveBeenCalledWith({
      attachment: expect.objectContaining({
        storyId: storyId(STORY_UUID),
        sourceId: SOURCE_ID,
        attachedBy: OPERATOR,
        attachedAt: ATTACHED_AT,
      }),
    });
    expect(repositories.inspectionRepository.inspect).toHaveBeenCalledWith(storyId(STORY_UUID));
    expect(inspectionResult).toMatchObject({
      ok: false,
      error: { code: "STORY_NOT_FOUND" },
    });
    expect(repositories.listingRepository.list).toHaveBeenCalledOnce();
    expect(listingResult).toEqual([]);
    expect(profileResult).toMatchObject({
      ok: true,
      profile: { id: "40000000-0000-4000-8000-000000000027", role: "writer", builtIn: false },
    });
    expect(repositories.agentProfileRepository.append).toHaveBeenCalledOnce();
    expect(repositories.agentProfileRepository.list).toHaveBeenCalledOnce();
    expect(profiles).toEqual([]);
    expect(createUuid).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("requires only the database environment value and never requires Firecrawl", () => {
    const controlledPool = makePool();
    const createPool = vi.fn(() => controlledPool.pool);

    const runtime = createStoryRuntimeFromEnvironment({
      siteId: SITE,
      environment: { NODE_ENV: "test", STORYRAIL_DATABASE_URL: DATABASE_URL },
      createPool,
    });

    expect(runtime.createStory).toBeTypeOf("function");
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(controlledPool.query).not.toHaveBeenCalled();
    expect(() =>
      createStoryRuntimeFromEnvironment({
        siteId: SITE,
        environment: { NODE_ENV: "test" },
        createPool,
      }),
    ).toThrowError(StoryRuntimeConfigurationError);
    expect(() =>
      createStoryRuntimeFromEnvironment({
        siteId: SITE,
        environment: { NODE_ENV: "test", STORYRAIL_DATABASE_URL: "  " },
        createPool,
      }),
    ).toThrowError(StoryRuntimeConfigurationError);
  });

  it("closes its Pool explicitly and idempotently", async () => {
    const controlledPool = makePool();
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
      siteId: SITE,
      createPool: () => controlledPool.pool,
    });

    const first = runtime.close();
    const second = runtime.close();
    expect(first).toBe(second);
    await Promise.all([first, second, runtime.close()]);
    expect(controlledPool.end).toHaveBeenCalledOnce();
  });

  it("propagates Pool closure failure through the same cached promise", async () => {
    const failure = new Error("controlled close failure");
    const controlledPool = makePool(async () => {
      throw failure;
    });
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
      siteId: SITE,
      createPool: () => controlledPool.pool,
    });

    const first = runtime.close();
    const second = runtime.close();
    expect(first).toBe(second);
    await expect(first).rejects.toBe(failure);
    await expect(second).rejects.toBe(failure);
    expect(controlledPool.end).toHaveBeenCalledOnce();
  });
});
