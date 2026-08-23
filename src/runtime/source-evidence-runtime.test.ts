// @vitest-environment node

import type { Pool, PoolConfig } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import { createFirecrawlSourceExtractor } from "@/adapters/source-extraction";
import { createPostgresSourceRepositories } from "@/adapters/source-persistence";
import { FIRECRAWL_API_KEY_SLOT, siteId } from "@/domain/editorial";
import { createRunSourceExtraction } from "@/application/source-extraction";
import {
  createExtractPersistedSource,
  createPreserveAndExtractUrlSource,
  createPreserveUrlSource,
} from "@/application/source-evidence";
import type {
  SourceExtractionRepository,
  UrlSourceRepository,
} from "@/application/source-persistence";
import {
  operatorId,
  sourceExtractionId,
  sourceId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import {
  createSourceEvidenceRuntime,
  createSourceEvidenceRuntimeFromEnvironment,
  type CreateSourceEvidenceRuntimeOptions,
} from "./source-evidence-runtime";

const factoryMocks = vi.hoisted(() => ({
  createFirecrawlSourceExtractor: vi.fn(),
  createPostgresSourceRepositories: vi.fn(),
  createRunSourceExtraction: vi.fn(),
  createPreserveUrlSource: vi.fn(),
  createExtractPersistedSource: vi.fn(),
  createPreserveAndExtractUrlSource: vi.fn(),
}));

vi.mock("@/adapters/source-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters/source-extraction")>();
  factoryMocks.createFirecrawlSourceExtractor.mockImplementation(
    actual.createFirecrawlSourceExtractor,
  );
  return {
    ...actual,
    createFirecrawlSourceExtractor: factoryMocks.createFirecrawlSourceExtractor,
  };
});

vi.mock("@/adapters/source-persistence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters/source-persistence")>();
  return {
    ...actual,
    createPostgresSourceRepositories: factoryMocks.createPostgresSourceRepositories,
  };
});

vi.mock("@/application/source-extraction", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/application/source-extraction")>();
  factoryMocks.createRunSourceExtraction.mockImplementation(actual.createRunSourceExtraction);
  return { ...actual, createRunSourceExtraction: factoryMocks.createRunSourceExtraction };
});

vi.mock("@/application/source-evidence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/application/source-evidence")>();
  factoryMocks.createPreserveUrlSource.mockImplementation(actual.createPreserveUrlSource);
  factoryMocks.createExtractPersistedSource.mockImplementation(actual.createExtractPersistedSource);
  factoryMocks.createPreserveAndExtractUrlSource.mockImplementation(
    actual.createPreserveAndExtractUrlSource,
  );
  return {
    ...actual,
    createPreserveUrlSource: factoryMocks.createPreserveUrlSource,
    createExtractPersistedSource: factoryMocks.createExtractPersistedSource,
    createPreserveAndExtractUrlSource: factoryMocks.createPreserveAndExtractUrlSource,
  };
});

const SITE = siteId("site-default");
const DATABASE_URL = "opaque-runtime-database-configuration";
const FIRECRAWL_API_KEY = "opaque-runtime-firecrawl-configuration";
const SOURCE_UUID = "10000000-0000-4000-8000-000000000013";
const SUCCESS_EXTRACTION_UUID = "20000000-0000-4000-8000-000000000013";
const FAILURE_EXTRACTION_UUID = "30000000-0000-4000-8000-000000000013";
const RECEIVED_AT = "2026-08-09T12:00:00.000Z";
const STARTED_AT = "2026-08-09T12:01:00.000Z";
const COMPLETED_AT = "2026-08-09T12:01:02.000Z";
const SECOND_STARTED_AT = "2026-08-09T12:02:00.000Z";
const SECOND_COMPLETED_AT = "2026-08-09T12:02:03.000Z";
const OPERATOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-runtime-composition"),
} as const);

interface ControlledPool {
  readonly pool: Pool;
  readonly query: ReturnType<typeof vi.fn>;
  readonly end: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

interface ControlledRepositories {
  readonly sources: UrlSourceRepository;
  readonly extractions: SourceExtractionRepository;
  readonly persist: ReturnType<typeof vi.fn<UrlSourceRepository["persist"]>>;
  readonly findById: ReturnType<typeof vi.fn<UrlSourceRepository["findById"]>>;
  readonly append: ReturnType<typeof vi.fn<SourceExtractionRepository["append"]>>;
  getStoredSource(): UrlSource | null;
}

// The Firecrawl key this newsroom has stored, encrypted exactly as the settings screen would
// have written it. Reading it back through the real cipher is the point: it proves a run picks
// its credential up from the store rather than from anything the process was started with.
const CREDENTIAL_KEY = Buffer.alloc(32, 7).toString("base64");
const STORED_FIRECRAWL_CREDENTIAL = createAesGcmCredentialCipher({ key: CREDENTIAL_KEY }).encrypt(
  FIRECRAWL_API_KEY,
  { siteId: SITE, slot: FIRECRAWL_API_KEY_SLOT },
);

/** A newsroom that has never had a Firecrawl key entered, which is every fresh installation. */
function makeEmptyPool(): ControlledPool {
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  const endMock = vi.fn(async () => undefined);
  return { pool: { query, end: endMock } as unknown as Pool, query, end: endMock };
}

function makePool(end: () => Promise<void> = async () => undefined): ControlledPool {
  const query = vi.fn(async (text: string) =>
    text.includes("storyrail.site_credentials")
      ? {
          rows: [
            {
              ciphertext: Buffer.from(STORED_FIRECRAWL_CREDENTIAL.ciphertext),
              nonce: Buffer.from(STORED_FIRECRAWL_CREDENTIAL.nonce),
              auth_tag: Buffer.from(STORED_FIRECRAWL_CREDENTIAL.authTag),
              key_version: STORED_FIRECRAWL_CREDENTIAL.keyVersion,
              hint: STORED_FIRECRAWL_CREDENTIAL.hint,
            },
          ],
          rowCount: 1,
        }
      : { rows: [], rowCount: 0 },
  );
  const endMock = vi.fn(end);
  return {
    pool: { query, end: endMock } as unknown as Pool,
    query,
    end: endMock,
  };
}

function makeRepositories(): ControlledRepositories {
  let storedSource: UrlSource | null = null;
  const persist = vi.fn<UrlSourceRepository["persist"]>(async ({ source }) => {
    storedSource = source;
    return { ok: true, source };
  });
  const findById = vi.fn<UrlSourceRepository["findById"]>(async (identity) =>
    storedSource?.id === identity ? storedSource : null,
  );
  const append = vi.fn<SourceExtractionRepository["append"]>(async ({ extraction }) => ({
    ok: true,
    extraction,
  }));

  return {
    sources: {
      persist,
      findById,
      findByCanonicalUrl: vi.fn<UrlSourceRepository["findByCanonicalUrl"]>(async () => null),
    },
    extractions: {
      append,
      listBySourceId: vi.fn<SourceExtractionRepository["listBySourceId"]>(async () => []),
    },
    persist,
    findById,
    append,
    getStoredSource: () => storedSource,
  };
}

// The Firecrawl adapter rejects near-empty renderings as extraction artifacts, so fixtures
// standing for a real extraction carry article-length content.
const RUNTIME_MARKDOWN = [
  "# Runtime-composed evidence",
  "",
  "The office published its composed figures on Tuesday, describing a steady rise across",
  "every district that filed on time, with the remainder expected within the week.",
].join("\n");

function successfulFetch(): typeof globalThis.fetch {
  return vi.fn<typeof globalThis.fetch>(async () =>
    Response.json({
      success: true,
      data: {
        markdown: RUNTIME_MARKDOWN,
        metadata: { title: "Runtime evidence", language: "en" },
      },
    }),
  );
}

function makeRuntimeOptions(
  pool: ControlledPool,
  overrides: Partial<CreateSourceEvidenceRuntimeOptions> = {},
): CreateSourceEvidenceRuntimeOptions {
  return {
    configuration: { databaseUrl: DATABASE_URL, credentialKey: CREDENTIAL_KEY },
    siteId: SITE,
    fetch: successfulFetch(),
    now: vi.fn(() => RECEIVED_AT),
    createUuid: vi.fn(() => SOURCE_UUID),
    createPool: vi.fn(() => pool.pool),
    ...overrides,
  };
}

beforeEach(() => {
  for (const factory of Object.values(factoryMocks)) {
    factory.mockClear();
  }

  const repositories = makeRepositories();
  factoryMocks.createPostgresSourceRepositories.mockImplementation(() => repositories);
});

describe("createSourceEvidenceRuntime", () => {
  it("constructs one inert pool and supplies the selected concrete adapters", () => {
    const controlledPool = makePool();
    const fetchImplementation = successfulFetch();
    const createPool = vi.fn(() => controlledPool.pool);
    const createUuid = vi.fn(() => SOURCE_UUID);
    const now = vi.fn(() => RECEIVED_AT);

    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, {
        fetch: fetchImplementation,
        createPool,
        createUuid,
        now,
      }),
    );

    expect(createPool).toHaveBeenCalledOnce();
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(createPostgresSourceRepositories).toHaveBeenCalledOnce();
    expect(createPostgresSourceRepositories).toHaveBeenCalledWith({
      pool: controlledPool.pool,
      siteId: SITE,
    });
    expect(createFirecrawlSourceExtractor).toHaveBeenCalledOnce();
    // The extractor is handed a way to fetch the key rather than the key. Building the runtime
    // must not read the credential store, because the runtime outlives every edit to it.
    expect(createFirecrawlSourceExtractor).toHaveBeenCalledWith({
      resolveApiKey: expect.any(Function),
      fetch: fetchImplementation,
    });
    expect(factoryMocks.createFirecrawlSourceExtractor.mock.calls[0]?.[0]).not.toHaveProperty(
      "apiKey",
    );
    expect(createRunSourceExtraction).toHaveBeenCalledOnce();
    expect(createPreserveUrlSource).toHaveBeenCalledOnce();
    expect(createExtractPersistedSource).toHaveBeenCalledOnce();
    expect(controlledPool.query).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(controlledPool.end).not.toHaveBeenCalled();
    expect(createPreserveAndExtractUrlSource).toHaveBeenCalledOnce();
    expect(createPreserveAndExtractUrlSource).toHaveBeenCalledWith({
      preserveUrlSource: runtime.preserveUrlSource,
      extractPersistedSource: runtime.extractPersistedSource,
    });
    expect(Object.keys(runtime)).toEqual([
      "preserveUrlSource",
      "extractPersistedSource",
      "preserveAndExtractUrlSource",
      "close",
    ]);
    expect(JSON.stringify(runtime)).not.toContain(DATABASE_URL);
    expect(JSON.stringify(runtime)).not.toContain(FIRECRAWL_API_KEY);
  });

  it("composes the exact primitive workflows and runs one preserve-then-extract invocation", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const createUuid = vi
      .fn<() => string>()
      .mockReturnValueOnce(SOURCE_UUID)
      .mockReturnValueOnce(SUCCESS_EXTRACTION_UUID);
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce(RECEIVED_AT)
      .mockReturnValueOnce(STARTED_AT)
      .mockReturnValueOnce(COMPLETED_AT);
    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, { createUuid, now }),
    );

    const result = await runtime.preserveAndExtractUrlSource({
      submittedUrl: "https://example.com/runtime?utm_source=inbox",
      submittedBy: OPERATOR,
    });

    expect(result.ok).toBe(true);
    expect(repositories.getStoredSource()).toMatchObject({
      id: sourceId(SOURCE_UUID),
      receivedAt: RECEIVED_AT,
    });
    if (!result.ok) {
      throw new Error("The controlled combined invocation must succeed.");
    }
    expect(result.source).toBe(repositories.persist.mock.calls[0]?.[0].source);
    expect(result.extraction).toBe(repositories.append.mock.calls[0]?.[0].extraction);
    expect(repositories.persist.mock.invocationCallOrder[0]!).toBeLessThan(
      repositories.findById.mock.invocationCallOrder[0]!,
    );
    expect(repositories.append).toHaveBeenCalledOnce();
    expect(repositories.append.mock.calls[0]?.[0].extraction).toMatchObject({
      id: sourceExtractionId(SUCCESS_EXTRACTION_UUID),
      sourceId: sourceId(SOURCE_UUID),
      startedAt: STARTED_AT,
      completedAt: COMPLETED_AT,
      outcome: "succeeded",
    });
    expect(createUuid).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(3);
    expect(createRunSourceExtraction).toHaveBeenCalledOnce();
    expect(createPreserveUrlSource).toHaveBeenCalledOnce();
    expect(createExtractPersistedSource).toHaveBeenCalledOnce();
    expect(createPreserveAndExtractUrlSource).toHaveBeenCalledOnce();
    expect(factoryMocks.createPreserveUrlSource.mock.calls[0]?.[0].sourceRepository).toBe(
      repositories.sources,
    );
    expect(factoryMocks.createExtractPersistedSource.mock.calls[0]?.[0].sourceRepository).toBe(
      repositories.sources,
    );
    expect(factoryMocks.createExtractPersistedSource.mock.calls[0]?.[0].extractionRepository).toBe(
      repositories.extractions,
    );
    expect(factoryMocks.createExtractPersistedSource.mock.calls[0]?.[0].runSourceExtraction).toBe(
      factoryMocks.createRunSourceExtraction.mock.results[0]?.value,
    );
    expect(factoryMocks.createPreserveAndExtractUrlSource).toHaveBeenCalledWith({
      preserveUrlSource: factoryMocks.createPreserveUrlSource.mock.results[0]?.value,
      extractPersistedSource: factoryMocks.createExtractPersistedSource.mock.results[0]?.value,
    });
  });

  it("passes workflow results through and appends successful and failed attempts identically", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const fetchImplementation = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ success: true, data: { markdown: RUNTIME_MARKDOWN } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    const createUuid = vi
      .fn<() => string>()
      .mockReturnValueOnce(SOURCE_UUID)
      .mockReturnValueOnce(SUCCESS_EXTRACTION_UUID)
      .mockReturnValueOnce(FAILURE_EXTRACTION_UUID);
    const now = vi
      .fn<() => string>()
      .mockReturnValueOnce(RECEIVED_AT)
      .mockReturnValueOnce(STARTED_AT)
      .mockReturnValueOnce(COMPLETED_AT)
      .mockReturnValueOnce(SECOND_STARTED_AT)
      .mockReturnValueOnce(SECOND_COMPLETED_AT);
    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, { fetch: fetchImplementation, createUuid, now }),
    );

    const preserveResult = await runtime.preserveUrlSource({
      submittedUrl: "https://example.com/runtime",
      submittedBy: OPERATOR,
    });
    const firstResult = await runtime.extractPersistedSource({
      sourceId: sourceId(SOURCE_UUID),
      requestedBy: OPERATOR,
    });
    const secondResult = await runtime.extractPersistedSource({
      sourceId: sourceId(SOURCE_UUID),
      requestedBy: OPERATOR,
    });

    expect(preserveResult).toBe(await repositories.persist.mock.results[0]?.value);
    expect(firstResult).toBe(await repositories.append.mock.results[0]?.value);
    expect(secondResult).toBe(await repositories.append.mock.results[1]?.value);
    const appended = repositories.append.mock.calls.map(
      ([command]) => command.extraction as SourceExtraction,
    );
    expect(appended.map((extraction) => extraction.outcome)).toEqual(["succeeded", "failed"]);
    expect(appended.map((extraction) => extraction.id)).toEqual([
      sourceExtractionId(SUCCESS_EXTRACTION_UUID),
      sourceExtractionId(FAILURE_EXTRACTION_UUID),
    ]);
    expect(now).toHaveBeenCalledTimes(5);
  });

  it("tells an operator with no Firecrawl key about the key, not about the page", async () => {
    const controlledPool = makeEmptyPool();
    const repositories = makeRepositories();
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const fetchImplementation = successfulFetch();
    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, { fetch: fetchImplementation }),
    );

    const result = await runtime.preserveAndExtractUrlSource({
      submittedUrl: "https://example.com/runtime",
      submittedBy: OPERATOR,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "FIRECRAWL_API_KEY_REQUIRED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: "firecrawl_api_key",
      },
    });
    // Nothing was retrieved, so nothing about a retrieval is written down. A failed extraction
    // here would tell whoever reads the Source later that the page was tried and would not open.
    expect(repositories.append).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("keeps an unreadable stored key distinct from one that was never entered", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, {
        // The stored credential is real; this process is holding a different encryption key.
        configuration: {
          databaseUrl: DATABASE_URL,
          credentialKey: Buffer.alloc(32, 8).toString("base64"),
        },
      }),
    );

    const result = await runtime.preserveAndExtractUrlSource({
      submittedUrl: "https://example.com/runtime",
      submittedBy: OPERATOR,
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE", slot: "firecrawl_api_key" },
    });
    expect(repositories.append).not.toHaveBeenCalled();
  });

  it("retains the Firecrawl adapter's fetch-rejection behavior", async () => {
    const controlledPool = makePool();
    const repositories = makeRepositories();
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const providerFailure = new Error("provider infrastructure unavailable");
    const runtime = createSourceEvidenceRuntime(
      makeRuntimeOptions(controlledPool, {
        fetch: vi.fn<typeof globalThis.fetch>(async () => {
          throw providerFailure;
        }),
        createUuid: vi
          .fn<() => string>()
          .mockReturnValueOnce(SOURCE_UUID)
          .mockReturnValueOnce(FAILURE_EXTRACTION_UUID),
        now: vi
          .fn<() => string>()
          .mockReturnValueOnce(RECEIVED_AT)
          .mockReturnValueOnce(STARTED_AT)
          .mockReturnValueOnce(COMPLETED_AT),
      }),
    );
    const result = await runtime.preserveAndExtractUrlSource({
      submittedUrl: "https://example.com/runtime",
      submittedBy: OPERATOR,
    });

    expect(result).toMatchObject({
      ok: true,
      extraction: {
        outcome: "failed",
        failure: { code: "RETRIEVAL_FAILED", retryable: true },
      },
    });
    if (!result.ok) {
      throw new Error("A recorded expected provider failure must complete the combined workflow.");
    }
    expect(result.source).toBe(repositories.getStoredSource());
    expect(result.extraction).toBe(repositories.append.mock.calls[0]?.[0].extraction);
    expect(repositories.append).toHaveBeenCalledOnce();
  });

  it("propagates unexpected pool and repository failures unchanged", async () => {
    const poolFailure = new Error("pool construction failed");
    const repositoryConstructionFailure = new Error("repository construction failed");
    const repositoryFailure = new Error("repository query failed");
    const controlledPool = makePool();

    expect(() =>
      createSourceEvidenceRuntime(
        makeRuntimeOptions(controlledPool, {
          createPool: () => {
            throw poolFailure;
          },
        }),
      ),
    ).toThrow(poolFailure);

    factoryMocks.createPostgresSourceRepositories.mockImplementationOnce(() => {
      throw repositoryConstructionFailure;
    });
    expect(() => createSourceEvidenceRuntime(makeRuntimeOptions(controlledPool))).toThrow(
      repositoryConstructionFailure,
    );

    const repositories = makeRepositories();
    repositories.persist.mockRejectedValueOnce(repositoryFailure);
    factoryMocks.createPostgresSourceRepositories.mockReturnValue(repositories);
    const runtime = createSourceEvidenceRuntime(makeRuntimeOptions(controlledPool));

    await expect(
      runtime.preserveUrlSource({
        submittedUrl: "https://example.com/runtime",
        submittedBy: OPERATOR,
      }),
    ).rejects.toBe(repositoryFailure);
  });

  it("owns idempotent closure and propagates close failures", async () => {
    const closeFailure = new Error("pool closure failed");
    const controlledPool = makePool(async () => {
      throw closeFailure;
    });
    const runtime = createSourceEvidenceRuntime(makeRuntimeOptions(controlledPool));

    const firstClose = runtime.close();
    const secondClose = runtime.close();

    expect(firstClose).toBe(secondClose);
    await expect(firstClose).rejects.toBe(closeFailure);
    await expect(runtime.close()).rejects.toBe(closeFailure);
    expect(controlledPool.end).toHaveBeenCalledOnce();
  });

  it("keeps pool ownership isolated between runtime instances", async () => {
    const firstPool = makePool();
    const secondPool = makePool();
    const createPool = vi
      .fn<(configuration: PoolConfig) => Pool>()
      .mockReturnValueOnce(firstPool.pool)
      .mockReturnValueOnce(secondPool.pool);
    const firstRuntime = createSourceEvidenceRuntime(makeRuntimeOptions(firstPool, { createPool }));
    const secondRuntime = createSourceEvidenceRuntime(
      makeRuntimeOptions(secondPool, { createPool }),
    );

    await firstRuntime.close();

    expect(firstPool.end).toHaveBeenCalledOnce();
    expect(secondPool.end).not.toHaveBeenCalled();

    await secondRuntime.close();

    expect(firstPool.end).toHaveBeenCalledOnce();
    expect(secondPool.end).toHaveBeenCalledOnce();
  });
});

describe("createSourceEvidenceRuntimeFromEnvironment", () => {
  it("loads an explicit environment once and forwards every deterministic seam", () => {
    const controlledPool = makePool();
    const reads: PropertyKey[] = [];
    const environment: NodeJS.ProcessEnv = new Proxy(
      {
        NODE_ENV: "test" as const,
        STORYRAIL_DATABASE_URL: DATABASE_URL,
      },
      {
        get(target, property, receiver) {
          reads.push(property);
          return Reflect.get(target, property, receiver);
        },
      },
    );
    const fetchImplementation = successfulFetch();
    const now = vi.fn(() => RECEIVED_AT);
    const createUuid = vi.fn(() => SOURCE_UUID);
    const createPool = vi.fn(() => controlledPool.pool);

    const runtime = createSourceEvidenceRuntimeFromEnvironment({
      environment,
      fetch: fetchImplementation,
      now,
      createUuid,
      createPool,
    });

    // Firecrawl is no longer among them: an API key is per-Site and cannot come from a
    // process-wide environment once one installation runs more than one newsroom.
    expect(reads).toEqual([
      "STORYRAIL_DATABASE_URL",
      "STORYRAIL_CREDENTIAL_KEY",
      "STORYRAIL_SITE_ID",
    ]);
    expect(createPool).toHaveBeenCalledWith({ connectionString: DATABASE_URL });
    expect(createFirecrawlSourceExtractor).toHaveBeenCalledWith({
      resolveApiKey: expect.any(Function),
      fetch: fetchImplementation,
    });
    expect(factoryMocks.createRunSourceExtraction.mock.calls[0]?.[0].now).toBe(now);
    expect(factoryMocks.createPreserveUrlSource.mock.calls[0]?.[0].now).toBe(now);
    expect(Object.keys(runtime)).toEqual([
      "preserveUrlSource",
      "extractPersistedSource",
      "preserveAndExtractUrlSource",
      "close",
    ]);
  });
});
