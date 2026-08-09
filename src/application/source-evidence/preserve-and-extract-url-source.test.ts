import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  type EditorialActor,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import type { ExtractPersistedSource } from "./extract-persisted-source";
import {
  createPreserveAndExtractUrlSource,
  type ExtractPersistedSourceFailureError,
  type PreserveAndExtractUrlSource,
  type PreserveAndExtractUrlSourceCommand,
  type PreserveAndExtractUrlSourceDependencies,
  type PreserveAndExtractUrlSourceResult,
  type PreserveUrlSourceFailureError,
} from "./preserve-and-extract-url-source";
import type { PreserveUrlSource } from "./preserve-url-source";

const SUBMITTED_URL = "https://Example.com/evidence?utm_source=inbox";
const SOURCE_ID = sourceId("source-0014");
const EXTRACTION_ID = sourceExtractionId("extraction-0014");
const RECEIVED_AT = "2026-08-09T16:00:00.000Z";
const STARTED_AT = "2026-08-09T16:01:00.000Z";
const COMPLETED_AT = "2026-08-09T16:01:02.000Z";
const ACTOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-0014"),
} as const);
const canonicalization = canonicalizeSourceUrl(SUBMITTED_URL);

if (!canonicalization.ok) {
  throw new Error("The combined-workflow fixture URL must be canonicalizable.");
}

const SOURCE = Object.freeze({
  id: SOURCE_ID,
  type: "url",
  submittedUrl: SUBMITTED_URL,
  canonicalUrl: canonicalization.canonicalUrl,
  submittedBy: ACTOR,
  receivedAt: RECEIVED_AT,
} satisfies UrlSource);
const SUCCESSFUL_EXTRACTION = Object.freeze({
  id: EXTRACTION_ID,
  sourceId: SOURCE_ID,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: STARTED_AT,
  completedAt: COMPLETED_AT,
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Durable evidence",
    title: "Durable evidence",
    byline: null,
    publishedAt: null,
    language: "en",
  }),
} satisfies SourceExtraction);
const FAILED_EXTRACTION = Object.freeze({
  id: EXTRACTION_ID,
  sourceId: SOURCE_ID,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: STARTED_AT,
  completedAt: COMPLETED_AT,
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
} satisfies SourceExtraction);

function makeDependencies(
  preservationResult: Awaited<ReturnType<PreserveUrlSource>> = { ok: true, source: SOURCE },
  extractionResult: Awaited<ReturnType<ExtractPersistedSource>> = {
    ok: true,
    extraction: SUCCESSFUL_EXTRACTION,
  },
  events?: string[],
): PreserveAndExtractUrlSourceDependencies & {
  readonly preserveUrlSource: ReturnType<typeof vi.fn<PreserveUrlSource>>;
  readonly extractPersistedSource: ReturnType<typeof vi.fn<ExtractPersistedSource>>;
} {
  return Object.freeze({
    preserveUrlSource: vi.fn<PreserveUrlSource>(async () => {
      events?.push("preservation");
      return preservationResult;
    }),
    extractPersistedSource: vi.fn<ExtractPersistedSource>(async () => {
      events?.push("extraction");
      return extractionResult;
    }),
  });
}

describe("createPreserveAndExtractUrlSource", () => {
  it("exposes the public command, dependency, result, function, and factory contracts", async () => {
    const dependencies: PreserveAndExtractUrlSourceDependencies = makeDependencies();
    const workflow: PreserveAndExtractUrlSource = createPreserveAndExtractUrlSource(dependencies);
    const command: PreserveAndExtractUrlSourceCommand = {
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
    };
    const result: PreserveAndExtractUrlSourceResult = await workflow(command);

    expect(createPreserveAndExtractUrlSource).toBeTypeOf("function");
    expect(workflow).toBeTypeOf("function");
    expect(workflow).toHaveLength(1);
    expect(result.ok).toBe(true);
  });

  it("preserves first with exact inputs, then extracts once by persisted ID with the same actor", async () => {
    const events: string[] = [];
    const dependencies = makeDependencies(undefined, undefined, events);
    const command = Object.freeze({ submittedUrl: SUBMITTED_URL, submittedBy: ACTOR });

    await createPreserveAndExtractUrlSource(dependencies)(command);

    expect(events).toEqual(["preservation", "extraction"]);
    expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
    expect(dependencies.preserveUrlSource).toHaveBeenCalledWith({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
    });
    expect(dependencies.preserveUrlSource.mock.calls[0]?.[0].submittedBy).toBe(ACTOR);
    expect(dependencies.extractPersistedSource).toHaveBeenCalledOnce();
    expect(dependencies.extractPersistedSource).toHaveBeenCalledWith({
      sourceId: SOURCE.id,
      requestedBy: ACTOR,
    });
    expect(dependencies.extractPersistedSource.mock.calls[0]?.[0].requestedBy).toBe(ACTOR);
    expect(Object.keys(dependencies.extractPersistedSource.mock.calls[0]![0])).toEqual([
      "sourceId",
      "requestedBy",
    ]);
  });

  it.each([
    Object.freeze({
      code: "SOURCE_URL_REQUIRED",
      message: "A Source URL is required.",
    } satisfies PreserveUrlSourceFailureError),
    Object.freeze({
      code: "DUPLICATE_SOURCE",
      message: "A Source with the same canonical URL already exists.",
      existingSourceId: sourceId("existing-source"),
      canonicalUrl: canonicalization.canonicalUrl,
    } satisfies PreserveUrlSourceFailureError),
    Object.freeze({
      code: "SOURCE_ID_CONFLICT",
      message: "A different Source with the same Source ID already exists.",
      sourceId: SOURCE_ID,
    } satisfies PreserveUrlSourceFailureError),
  ])("returns preservation failure $code unchanged and prevents extraction", async (error) => {
    const dependencies = makeDependencies({ ok: false, error });

    const result = await createPreserveAndExtractUrlSource(dependencies)({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
    });

    expect(result).toEqual({ ok: false, stage: "preservation", error });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("preservation");
      expect(result.error).toBe(error);
    }
    expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
    expect(dependencies.extractPersistedSource).not.toHaveBeenCalled();
  });

  it.each([
    ["successful", SUCCESSFUL_EXTRACTION],
    ["expected provider failure", FAILED_EXTRACTION],
  ] as const)(
    "returns exact Source and %s extraction as combined success",
    async (_label, extraction) => {
      const dependencies = makeDependencies({ ok: true, source: SOURCE }, { ok: true, extraction });

      const result = await createPreserveAndExtractUrlSource(dependencies)({
        submittedUrl: SUBMITTED_URL,
        submittedBy: ACTOR,
      });

      expect(result).toEqual({ ok: true, source: SOURCE, extraction });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.source).toBe(SOURCE);
        expect(result.extraction).toBe(extraction);
      }
      expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
      expect(dependencies.extractPersistedSource).toHaveBeenCalledOnce();
    },
  );

  it("returns extraction failure with the preserved Source and exact error without compensation", async () => {
    const error = Object.freeze({
      code: "SOURCE_NOT_FOUND",
      message: "The Source referenced by the extraction does not exist.",
      sourceId: SOURCE_ID,
    } satisfies ExtractPersistedSourceFailureError);
    const dependencies = makeDependencies({ ok: true, source: SOURCE }, { ok: false, error });

    const result = await createPreserveAndExtractUrlSource(dependencies)({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
    });

    expect(result).toEqual({ ok: false, stage: "extraction", source: SOURCE, error });
    expect(result.ok).toBe(false);
    if (!result.ok && result.stage === "extraction") {
      expect(result.source).toBe(SOURCE);
      expect(result.error).toBe(error);
    }
    expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
    expect(dependencies.extractPersistedSource).toHaveBeenCalledOnce();
    expect(Object.keys(dependencies)).toEqual(["preserveUrlSource", "extractPersistedSource"]);
  });

  it("propagates an unexpected preservation rejection unchanged and stops extraction", async () => {
    const rejection = Object.freeze({ infrastructure: "preservation unavailable" });
    const dependencies = makeDependencies();
    dependencies.preserveUrlSource.mockRejectedValueOnce(rejection);

    await expect(
      createPreserveAndExtractUrlSource(dependencies)({
        submittedUrl: SUBMITTED_URL,
        submittedBy: ACTOR,
      }),
    ).rejects.toBe(rejection);
    expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
    expect(dependencies.extractPersistedSource).not.toHaveBeenCalled();
  });

  it("propagates an unexpected extraction rejection unchanged after preservation", async () => {
    const rejection = new Error("extraction unavailable");
    const dependencies = makeDependencies();
    dependencies.extractPersistedSource.mockRejectedValueOnce(rejection);

    await expect(
      createPreserveAndExtractUrlSource(dependencies)({
        submittedUrl: SUBMITTED_URL,
        submittedBy: ACTOR,
      }),
    ).rejects.toBe(rejection);
    expect(dependencies.preserveUrlSource).toHaveBeenCalledOnce();
    expect(dependencies.extractPersistedSource).toHaveBeenCalledOnce();
  });

  it("does not mutate commands, dependencies, actors, Sources, extractions, or errors", async () => {
    const command = Object.freeze({ submittedUrl: SUBMITTED_URL, submittedBy: ACTOR });
    const preservationError = Object.freeze({
      code: "SOURCE_URL_REQUIRED",
      message: "A Source URL is required.",
    } satisfies PreserveUrlSourceFailureError);
    const extractionError = Object.freeze({
      code: "SOURCE_NOT_FOUND",
      message: "The Source referenced by the extraction does not exist.",
      sourceId: SOURCE_ID,
    } satisfies ExtractPersistedSourceFailureError);
    const successfulDependencies = makeDependencies();
    const preservationFailureDependencies = makeDependencies({
      ok: false,
      error: preservationError,
    });
    const extractionFailureDependencies = makeDependencies(
      { ok: true, source: SOURCE },
      { ok: false, error: extractionError },
    );
    const snapshots = {
      command: structuredClone(command),
      actor: structuredClone(ACTOR),
      source: structuredClone(SOURCE),
      extraction: structuredClone(SUCCESSFUL_EXTRACTION),
      preservationError: structuredClone(preservationError),
      extractionError: structuredClone(extractionError),
      successfulDependencies: { ...successfulDependencies },
      preservationFailureDependencies: { ...preservationFailureDependencies },
      extractionFailureDependencies: { ...extractionFailureDependencies },
    };

    await createPreserveAndExtractUrlSource(successfulDependencies)(command);
    await createPreserveAndExtractUrlSource(preservationFailureDependencies)(command);
    await createPreserveAndExtractUrlSource(extractionFailureDependencies)(command);

    expect(command).toEqual(snapshots.command);
    expect(ACTOR).toEqual(snapshots.actor);
    expect(SOURCE).toEqual(snapshots.source);
    expect(SUCCESSFUL_EXTRACTION).toEqual(snapshots.extraction);
    expect(preservationError).toEqual(snapshots.preservationError);
    expect(extractionError).toEqual(snapshots.extractionError);
    expect(successfulDependencies).toEqual(snapshots.successfulDependencies);
    expect(preservationFailureDependencies).toEqual(snapshots.preservationFailureDependencies);
    expect(extractionFailureDependencies).toEqual(snapshots.extractionFailureDependencies);
  });

  it("restricts inputs and preserves readonly, branded, provider-neutral typing", () => {
    const commandKeysAreExact: Readonly<Record<keyof PreserveAndExtractUrlSourceCommand, true>> = {
      submittedUrl: true,
      submittedBy: true,
    };
    const dependencyKeysAreExact: Readonly<
      Record<keyof PreserveAndExtractUrlSourceDependencies, true>
    > = { preserveUrlSource: true, extractPersistedSource: true };
    const successKeysAreProviderNeutral: Readonly<
      Record<keyof Extract<PreserveAndExtractUrlSourceResult, { readonly ok: true }>, true>
    > = { ok: true, source: true, extraction: true };
    const extractionFailureKeysAreProviderNeutral: Readonly<
      Record<
        keyof Extract<
          PreserveAndExtractUrlSourceResult,
          { readonly ok: false; readonly stage: "extraction" }
        >,
        true
      >
    > = { ok: true, stage: true, source: true, error: true };
    const assertCommand: (command: PreserveAndExtractUrlSourceCommand) => void = () => undefined;
    const dependencies = makeDependencies();
    const failure: PreserveAndExtractUrlSourceResult = {
      ok: false,
      stage: "preservation",
      error: { code: "SOURCE_URL_REQUIRED", message: "A Source URL is required." },
    };

    assertCommand({ submittedUrl: SUBMITTED_URL, submittedBy: ACTOR });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error Source identities belong to the preservation workflow
      sourceId: SOURCE_ID,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error extraction identities belong to the extraction workflow
      extractionId: EXTRACTION_ID,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error timestamps belong to the existing workflow clocks
      receivedAt: RECEIVED_AT,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error canonical URLs belong to Source intake
      canonicalUrl: SOURCE.canonicalUrl,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error Source snapshots are loaded by the existing workflows
      source: SOURCE,
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error repositories belong to workflow dependencies
      repositories: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error credentials are runtime composition concerns
      credentials: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error provider requests are adapter concerns
      providerRequest: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error provider responses are adapter concerns
      providerResponse: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error retry controls are outside this workflow
      retry: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error transaction controls are persistence concerns
      transaction: {},
    });
    assertCommand({
      submittedUrl: SUBMITTED_URL,
      submittedBy: ACTOR,
      // @ts-expect-error one actor supplies both provenance roles
      requestedBy: ACTOR,
    });

    const assertReadonly = (
      readonlyCommand: PreserveAndExtractUrlSourceCommand,
      readonlyDependencies: PreserveAndExtractUrlSourceDependencies,
      readonlyResult: PreserveAndExtractUrlSourceResult,
      readonlyActor: EditorialActor,
      readonlySource: UrlSource,
      readonlyExtraction: SourceExtraction,
    ) => {
      // @ts-expect-error commands are readonly
      readonlyCommand.submittedUrl = "changed";
      // @ts-expect-error dependencies are readonly
      readonlyDependencies.preserveUrlSource = dependencies.preserveUrlSource;
      // @ts-expect-error results are readonly
      readonlyResult.ok = true;
      // @ts-expect-error actors are readonly
      readonlyActor.type = "agent";
      // @ts-expect-error Sources are readonly
      readonlySource.receivedAt = "changed";
      // @ts-expect-error extractions are readonly
      readonlyExtraction.completedAt = "changed";
    };

    expect(commandKeysAreExact).toEqual({ submittedUrl: true, submittedBy: true });
    expect(dependencyKeysAreExact).toEqual({
      preserveUrlSource: true,
      extractPersistedSource: true,
    });
    expect(successKeysAreProviderNeutral).toEqual({ ok: true, source: true, extraction: true });
    expect(extractionFailureKeysAreProviderNeutral).toEqual({
      ok: true,
      stage: true,
      source: true,
      error: true,
    });
    expect(failure).toBeDefined();
    expect(assertReadonly).toBeTypeOf("function");
  });
});
