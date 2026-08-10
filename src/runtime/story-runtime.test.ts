// @vitest-environment node

import type { Pool, PoolConfig } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPostgresStoryInspectionRepository } from "@/adapters/story-inspection";
import { createPostgresStoryListingRepository } from "@/adapters/story-listing";
import { createPostgresStoryRepository } from "@/adapters/story-persistence";
import { createPostgresStorySourceAttachmentRepository } from "@/adapters/story-source-persistence";
import { createPostgresSourceInboxRepository } from "@/adapters/source-inbox";
import { createPostgresSourceTriageDecisionRepository } from "@/adapters/source-triage-persistence";
import type { SourceInboxRepository } from "@/application/source-inbox";
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

  return {
    storyRepository,
    attachmentRepository,
    inspectionRepository,
    listingRepository,
    sourceInboxRepository,
    sourceTriageRepository,
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
});

describe("createStoryRuntime", () => {
  it("owns one inert Pool and composes all Story PostgreSQL adapters", () => {
    const controlledPool = makePool();
    const createPool = vi.fn<(configuration: PoolConfig) => Pool>(() => controlledPool.pool);
    const createUuid = vi.fn(() => STORY_UUID);
    const now = vi.fn(() => CREATED_AT);
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
      createPool,
      createUuid,
      now,
    });

    expect(createPool).toHaveBeenCalledOnce();
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(createPostgresStoryRepository).toHaveBeenCalledWith({ pool: controlledPool.pool });
    expect(createPostgresStorySourceAttachmentRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
    });
    expect(createPostgresStoryInspectionRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
    });
    expect(createPostgresStoryListingRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
    });
    expect(createPostgresSourceInboxRepository).toHaveBeenCalledWith({ pool: controlledPool.pool });
    expect(createPostgresSourceTriageDecisionRepository).toHaveBeenCalledWith({
      pool: controlledPool.pool,
    });
    expect(controlledPool.query).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(controlledPool.end).not.toHaveBeenCalled();
    expect(Object.keys(runtime)).toEqual([
      "createStory",
      "attachSourceToStory",
      "inspectStory",
      "listStories",
      "listPendingSources",
      "recordSourceTriageDecision",
      "close",
    ]);
    expect(JSON.stringify(runtime)).not.toContain(DATABASE_URL);
  });

  it("supplies UUID Story identity and ISO clock values to the existing workflows", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createStoryRepository.mockReturnValue(repositories.storyRepository);
    factoryMocks.createAttachmentRepository.mockReturnValue(repositories.attachmentRepository);
    factoryMocks.createInspectionRepository.mockReturnValue(repositories.inspectionRepository);
    factoryMocks.createListingRepository.mockReturnValue(repositories.listingRepository);
    const createUuid = vi.fn(() => STORY_UUID);
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce(CREATED_AT)
      .mockReturnValueOnce(ATTACHED_AT);
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
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
    expect(createUuid).toHaveBeenCalledOnce();
    expect(now).toHaveBeenCalledTimes(2);
  });

  it("requires only the database environment value and never requires Firecrawl", () => {
    const controlledPool = makePool();
    const createPool = vi.fn(() => controlledPool.pool);

    const runtime = createStoryRuntimeFromEnvironment({
      environment: { NODE_ENV: "test", STORYRAIL_DATABASE_URL: DATABASE_URL },
      createPool,
    });

    expect(runtime.createStory).toBeTypeOf("function");
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(controlledPool.query).not.toHaveBeenCalled();
    expect(() =>
      createStoryRuntimeFromEnvironment({
        environment: { NODE_ENV: "test" },
        createPool,
      }),
    ).toThrowError(StoryRuntimeConfigurationError);
    expect(() =>
      createStoryRuntimeFromEnvironment({
        environment: { NODE_ENV: "test", STORYRAIL_DATABASE_URL: "  " },
        createPool,
      }),
    ).toThrowError(StoryRuntimeConfigurationError);
  });

  it("closes its Pool explicitly and idempotently", async () => {
    const controlledPool = makePool();
    const runtime = createStoryRuntime({
      databaseUrl: DATABASE_URL,
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
