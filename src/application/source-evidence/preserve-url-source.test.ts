import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  agentRunId,
  canonicalizeSourceUrl,
  intakeUrlSource,
  operatorId,
  sourceExtractionId,
  sourceId,
  type EditorialActor,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";
import type { PersistUrlSourceResult, UrlSourceRepository } from "@/application/source-persistence";

import {
  createPreserveUrlSource,
  type PreserveUrlSource,
  type PreserveUrlSourceCommand,
  type PreserveUrlSourceDependencies,
  type PreserveUrlSourceResult,
} from "./preserve-url-source";

vi.mock("@/domain/editorial", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/editorial")>();

  return {
    ...actual,
    intakeUrlSource: vi.fn(actual.intakeUrlSource),
  };
});

const OPERATOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-0011"),
} as const);
const AGENT = Object.freeze({
  type: "agent",
  role: "assignment_editor",
  runId: agentRunId("agent-run-0011"),
} as const);
const SOURCE_ID = sourceId("source-0011");
const RECEIVED_AT = "2026-08-09T15:00:00.000Z";
const SUBMITTED_URL = "https://Example.com/report?edition=us&utm_source=inbox";
const canonicalization = canonicalizeSourceUrl(SUBMITTED_URL);

if (!canonicalization.ok) {
  throw new Error("The Source fixture URL must be canonicalizable.");
}

const CANONICAL_URL = canonicalization.canonicalUrl;

type MockSourceRepository = Readonly<{
  persist: ReturnType<typeof vi.fn<UrlSourceRepository["persist"]>>;
  findById: ReturnType<typeof vi.fn<UrlSourceRepository["findById"]>>;
  findByCanonicalUrl: ReturnType<typeof vi.fn<UrlSourceRepository["findByCanonicalUrl"]>>;
}>;

function makeRepository(result?: PersistUrlSourceResult, events?: string[]): MockSourceRepository {
  const persist = vi.fn<UrlSourceRepository["persist"]>(async (command) => {
    events?.push("persist");
    return result ?? { ok: true, source: command.source };
  });

  return Object.freeze({
    persist,
    findById: vi.fn<UrlSourceRepository["findById"]>(async () => null),
    findByCanonicalUrl: vi.fn<UrlSourceRepository["findByCanonicalUrl"]>(async () => null),
  });
}

function makeDependencies(
  sourceRepository: MockSourceRepository,
  events?: string[],
): PreserveUrlSourceDependencies {
  return Object.freeze({
    sourceRepository,
    createSourceId: vi.fn(() => {
      events?.push("id");
      return SOURCE_ID;
    }),
    now: vi.fn(() => {
      events?.push("clock");
      return RECEIVED_AT;
    }),
  });
}

const intakeUrlSourceMock = vi.mocked(intakeUrlSource);

beforeEach(() => {
  intakeUrlSourceMock.mockClear();
});

describe("createPreserveUrlSource", () => {
  it("exposes the public factory, command, dependencies, function, and result contracts", async () => {
    const repository = makeRepository();
    const dependencies: PreserveUrlSourceDependencies = makeDependencies(repository);
    const preserve: PreserveUrlSource = createPreserveUrlSource(dependencies);
    const command: PreserveUrlSourceCommand = {
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
    };
    const result: PreserveUrlSourceResult = await preserve(command);

    expect(createPreserveUrlSource).toBeTypeOf("function");
    expect(preserve).toBeTypeOf("function");
    expect(preserve).toHaveLength(1);
    expect(result.ok).toBe(true);
  });

  it.each([
    ["operator", OPERATOR],
    ["agent", AGENT],
  ] as const)("preserves exact %s provenance and Source values", async (_label, actor) => {
    const events: string[] = [];
    const repository = makeRepository(undefined, events);
    const dependencies = makeDependencies(repository, events);
    const intakeImplementation = intakeUrlSourceMock.getMockImplementation();

    if (!intakeImplementation) {
      throw new Error("The intake mock must retain its real implementation.");
    }

    intakeUrlSourceMock.mockImplementationOnce((command, existingSources) => {
      events.push("intake");
      return intakeImplementation(command, existingSources);
    });

    const result = await createPreserveUrlSource(dependencies)({
      submittedUrl: SUBMITTED_URL,
      submittedBy: actor,
    });

    expect(events).toEqual(["id", "clock", "intake", "persist"]);
    expect(dependencies.createSourceId).toHaveBeenCalledOnce();
    expect(dependencies.now).toHaveBeenCalledOnce();
    expect(intakeUrlSourceMock).toHaveBeenCalledOnce();
    expect(intakeUrlSourceMock).toHaveBeenCalledWith(
      {
        sourceId: SOURCE_ID,
        submittedUrl: SUBMITTED_URL,
        submittedBy: actor,
        receivedAt: RECEIVED_AT,
      },
      [],
    );
    expect(repository.persist).toHaveBeenCalledOnce();

    if (!result.ok) {
      throw new Error("The valid fixture must be preserved.");
    }

    expect(result.source).toEqual({
      id: SOURCE_ID,
      type: "url",
      submittedUrl: SUBMITTED_URL,
      canonicalUrl: "https://example.com/report?edition=us",
      submittedBy: actor,
      receivedAt: RECEIVED_AT,
    });
    expect(result.source.submittedBy).toBe(actor);
    expect(repository.persist).toHaveBeenCalledWith({ source: result.source });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.findByCanonicalUrl).not.toHaveBeenCalled();
  });

  it("returns a representative intake validation failure unchanged and skips persistence", async () => {
    const repository = makeRepository();
    const result = await createPreserveUrlSource(makeDependencies(repository))({
      submittedUrl: "   ",
      submittedBy: OPERATOR,
    });
    const domainResult = intakeUrlSourceMock.mock.results[0]!.value;

    expect(result).toBe(domainResult);
    expect(result).toEqual({
      ok: false,
      error: { code: "SOURCE_URL_REQUIRED", message: "A Source URL is required." },
    });
    expect(repository.persist).not.toHaveBeenCalled();
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.findByCanonicalUrl).not.toHaveBeenCalled();
  });

  it.each([
    {
      ok: false,
      error: {
        code: "DUPLICATE_SOURCE",
        message: "A Source with the same canonical URL already exists.",
        existingSourceId: sourceId("source-existing"),
        canonicalUrl: CANONICAL_URL,
      },
    },
    {
      ok: false,
      error: {
        code: "SOURCE_ID_CONFLICT",
        message: "A different Source with the same Source ID already exists.",
        sourceId: SOURCE_ID,
      },
    },
  ] satisfies readonly PersistUrlSourceResult[])(
    "returns repository conflict $error.code unchanged without a uniqueness pre-read",
    async (repositoryResult) => {
      const repository = makeRepository(repositoryResult);
      const result = await createPreserveUrlSource(makeDependencies(repository))({
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
      });

      expect(result).toBe(repositoryResult);
      expect(repository.persist).toHaveBeenCalledOnce();
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.findByCanonicalUrl).not.toHaveBeenCalled();
    },
  );

  it("returns repository success unchanged", async () => {
    const intakeResult = intakeUrlSource(
      {
        sourceId: SOURCE_ID,
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
        receivedAt: RECEIVED_AT,
      },
      [],
    );

    if (!intakeResult.ok) {
      throw new Error("The valid fixture must pass intake.");
    }

    intakeUrlSourceMock.mockClear();
    const repositoryResult = Object.freeze({ ok: true, source: intakeResult.source } as const);
    const result = await createPreserveUrlSource(
      makeDependencies(makeRepository(repositoryResult)),
    )({ submittedUrl: SUBMITTED_URL, submittedBy: OPERATOR });

    expect(result).toBe(repositoryResult);
  });

  it("propagates an identity failure unchanged and stops downstream work", async () => {
    const rejection = new Error("identity unavailable");
    const repository = makeRepository();
    const dependencies = Object.freeze({
      sourceRepository: repository,
      createSourceId: vi.fn(() => {
        throw rejection;
      }),
      now: vi.fn(() => RECEIVED_AT),
    });

    await expect(
      createPreserveUrlSource(dependencies)({
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
      }),
    ).rejects.toBe(rejection);
    expect(dependencies.createSourceId).toHaveBeenCalledOnce();
    expect(dependencies.now).not.toHaveBeenCalled();
    expect(intakeUrlSourceMock).not.toHaveBeenCalled();
    expect(repository.persist).not.toHaveBeenCalled();
  });

  it("propagates a clock failure unchanged and stops intake and persistence", async () => {
    const rejection = new Error("clock unavailable");
    const repository = makeRepository();
    const dependencies = Object.freeze({
      sourceRepository: repository,
      createSourceId: vi.fn(() => SOURCE_ID),
      now: vi.fn(() => {
        throw rejection;
      }),
    });

    await expect(
      createPreserveUrlSource(dependencies)({
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
      }),
    ).rejects.toBe(rejection);
    expect(dependencies.createSourceId).toHaveBeenCalledOnce();
    expect(dependencies.now).toHaveBeenCalledOnce();
    expect(intakeUrlSourceMock).not.toHaveBeenCalled();
    expect(repository.persist).not.toHaveBeenCalled();
  });

  it("propagates a persistence rejection unchanged without retry", async () => {
    const rejection = Object.freeze({ infrastructure: "unavailable" });
    const repository = makeRepository();
    repository.persist.mockRejectedValueOnce(rejection);

    await expect(
      createPreserveUrlSource(makeDependencies(repository))({
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
      }),
    ).rejects.toBe(rejection);
    expect(repository.persist).toHaveBeenCalledOnce();
    expect(intakeUrlSourceMock).toHaveBeenCalledOnce();
  });

  it("propagates an unexpected intake failure unchanged and skips persistence", async () => {
    const rejection = new Error("unexpected intake failure");
    const repository = makeRepository();
    intakeUrlSourceMock.mockImplementationOnce(() => {
      throw rejection;
    });

    await expect(
      createPreserveUrlSource(makeDependencies(repository))({
        submittedUrl: SUBMITTED_URL,
        submittedBy: OPERATOR,
      }),
    ).rejects.toBe(rejection);
    expect(intakeUrlSourceMock).toHaveBeenCalledOnce();
    expect(repository.persist).not.toHaveBeenCalled();
  });

  it("does not mutate commands, actors, Sources, or dependencies", async () => {
    const command = Object.freeze({ submittedUrl: SUBMITTED_URL, submittedBy: OPERATOR });
    const commandSnapshot = structuredClone(command);
    const actorSnapshot = structuredClone(OPERATOR);
    const repository = makeRepository();
    const dependencies = makeDependencies(repository);
    const dependenciesSnapshot = { ...dependencies };

    const result = await createPreserveUrlSource(dependencies)(command);

    expect(command).toEqual(commandSnapshot);
    expect(OPERATOR).toEqual(actorSnapshot);
    expect(dependencies).toEqual(dependenciesSnapshot);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sourceSnapshot = structuredClone(result.source);
      expect(result.source).toEqual(sourceSnapshot);
    }
  });

  it("restricts commands and preserves readonly, branded, provider-neutral typing", () => {
    const commandKeysAreExact: Readonly<Record<keyof PreserveUrlSourceCommand, true>> = {
      submittedUrl: true,
      submittedBy: true,
    };
    const assertCommand: (command: PreserveUrlSourceCommand) => void = () => undefined;
    const assertSource: (source: UrlSource) => void = () => undefined;
    const assertExtractionId: (identity: SourceExtraction["id"]) => void = () => undefined;
    const repository = makeRepository();
    const dependencies = makeDependencies(repository);
    const result: PreserveUrlSourceResult = {
      ok: false,
      error: { code: "SOURCE_URL_REQUIRED", message: "A Source URL is required." },
    };

    assertCommand({ submittedUrl: SUBMITTED_URL, submittedBy: OPERATOR });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error Source identity belongs to the injected factory
      sourceId: SOURCE_ID,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error canonical URLs belong to domain intake
      canonicalUrl: CANONICAL_URL,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error timestamps belong to the injected clock
      receivedAt: RECEIVED_AT,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error existing Source collections are not caller input
      existingSources: [],
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error repositories belong to workflow dependencies
      sourceRepository: repository,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error credentials are runtime composition concerns
      credentials: undefined,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error provider requests are adapter concerns
      providerRequest: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error provider responses are adapter concerns
      providerResponse: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: OPERATOR,
      // @ts-expect-error transaction controls are persistence concerns
      transaction: {},
    });

    const intakeResult = intakeUrlSource(
      {
        sourceId: SOURCE_ID,
        submittedUrl: " ",
        submittedBy: OPERATOR,
        receivedAt: RECEIVED_AT,
      },
      [],
    );
    // @ts-expect-error validation-result unions are not valid Sources
    assertSource(intakeResult);
    // @ts-expect-error Source and extraction identities are branded and non-interchangeable
    assertExtractionId(SOURCE_ID);

    const assertReadonly = (
      readonlyCommand: PreserveUrlSourceCommand,
      readonlyDependencies: PreserveUrlSourceDependencies,
      readonlyResult: PreserveUrlSourceResult,
      readonlyActor: EditorialActor,
      readonlySource: UrlSource,
    ) => {
      // @ts-expect-error commands are readonly
      readonlyCommand.submittedUrl = "changed";
      // @ts-expect-error dependencies are readonly
      readonlyDependencies.now = () => "changed";
      // @ts-expect-error result discriminants are readonly
      readonlyResult.ok = true;
      // @ts-expect-error actor discriminants are readonly
      readonlyActor.type = "agent";
      // @ts-expect-error Sources are readonly
      readonlySource.receivedAt = "changed";
    };

    expect(commandKeysAreExact).toEqual({ submittedUrl: true, submittedBy: true });
    expect(dependencies).toBeDefined();
    expect(result).toBeDefined();
    expect(assertReadonly).toBeTypeOf("function");
    expect(sourceExtractionId("different-brand")).not.toBe(SOURCE_ID);
  });
});
