// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type {
  PreserveAndExtractUrlSource,
  PreserveAndExtractUrlSourceResult,
} from "@/application/source-evidence";
import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";
import type { SourceEvidenceRuntime } from "@/runtime";

import {
  createPreserveAndExtractUrlSourceHttpHandler,
  type PreserveAndExtractUrlSourceHttpHandler,
  type PreserveAndExtractUrlSourceHttpHandlerDependencies,
  type PreserveAndExtractUrlSourceHttpRequestBody,
} from "./preserve-and-extract-url-source-handler";

const SUBMITTED_URL = "  https://Example.com/article?utm_source=inbox  ";
const OPERATOR_VALUE = "  operator-http-0015  ";
const canonicalization = canonicalizeSourceUrl("https://example.com/article");

if (!canonicalization.ok) {
  throw new Error("The HTTP handler fixture URL must be canonicalizable.");
}

const ACTOR = Object.freeze({
  type: "operator",
  operatorId: operatorId(OPERATOR_VALUE),
} as const);
const SOURCE = Object.freeze({
  id: sourceId("source-http-0015"),
  type: "url",
  submittedUrl: SUBMITTED_URL,
  canonicalUrl: canonicalization.canonicalUrl,
  submittedBy: ACTOR,
  receivedAt: "2026-08-09T18:00:00.000Z",
} satisfies UrlSource);
const SUCCESSFUL_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-http-0015"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "2026-08-09T18:00:01.000Z",
  completedAt: "2026-08-09T18:00:02.000Z",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Evidence",
    title: "Evidence",
    byline: null,
    publishedAt: null,
    language: "en",
  }),
} satisfies SourceExtraction);
const FAILED_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-http-failed-0015"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "2026-08-09T18:01:01.000Z",
  completedAt: "2026-08-09T18:01:02.000Z",
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
} satisfies SourceExtraction);
const SUCCESS_RESULT = Object.freeze({
  ok: true,
  source: SOURCE,
  extraction: SUCCESSFUL_EXTRACTION,
} satisfies PreserveAndExtractUrlSourceResult);

function makeRequest(
  body: BodyInit | null = JSON.stringify({ submittedUrl: SUBMITTED_URL }),
  contentType: string | null = "application/json",
): Request {
  const headers = contentType === null ? undefined : { "Content-Type": contentType };

  return new Request("http://storyrail.test/api/source-evidence/url", {
    method: "POST",
    headers,
    body,
  });
}

function makeRuntime(result: PreserveAndExtractUrlSourceResult = SUCCESS_RESULT): {
  readonly runtime: SourceEvidenceRuntime;
  readonly combined: ReturnType<typeof vi.fn<PreserveAndExtractUrlSource>>;
  readonly preserve: ReturnType<typeof vi.fn<SourceEvidenceRuntime["preserveUrlSource"]>>;
  readonly extract: ReturnType<typeof vi.fn<SourceEvidenceRuntime["extractPersistedSource"]>>;
  readonly close: ReturnType<typeof vi.fn<SourceEvidenceRuntime["close"]>>;
} {
  const combined = vi.fn<PreserveAndExtractUrlSource>(async () => result);
  const preserve = vi.fn<SourceEvidenceRuntime["preserveUrlSource"]>();
  const extract = vi.fn<SourceEvidenceRuntime["extractPersistedSource"]>();
  const close = vi.fn<SourceEvidenceRuntime["close"]>(async () => undefined);

  return {
    runtime: Object.freeze({
      preserveAndExtractUrlSource: combined,
      preserveUrlSource: preserve,
      extractPersistedSource: extract,
      close,
    }),
    combined,
    preserve,
    extract,
    close,
  };
}

function makeDependencies(
  result: PreserveAndExtractUrlSourceResult = SUCCESS_RESULT,
  environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    STORYRAIL_OPERATOR_ID: OPERATOR_VALUE,
  },
): ReturnType<typeof makeRuntime> & {
  readonly dependencies: PreserveAndExtractUrlSourceHttpHandlerDependencies;
  readonly getRuntime: ReturnType<typeof vi.fn<() => SourceEvidenceRuntime>>;
} {
  const controlled = makeRuntime(result);
  const getRuntime = vi.fn(() => controlled.runtime);

  return {
    ...controlled,
    getRuntime,
    dependencies: Object.freeze({ getRuntime, environment }),
  };
}

async function expectJsonResponse(
  response: Response,
  status: number,
  body: unknown,
): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual(body);
}

const INVALID_JSON_BODY = {
  ok: false,
  error: {
    code: "INVALID_JSON",
    message: "The request body must contain valid JSON.",
  },
};
const INVALID_REQUEST_BODY = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "The request body must contain exactly one string property named submittedUrl.",
  },
};
const INTERNAL_ERROR_BODY = {
  ok: false,
  error: {
    code: "INTERNAL_SERVER_ERROR",
    message: "The Source evidence request could not be completed.",
  },
};

describe("createPreserveAndExtractUrlSourceHttpHandler", () => {
  it("exposes the public request, dependency, handler, and factory contracts inertly", () => {
    let environmentReads = 0;
    const environment = new Proxy({} as NodeJS.ProcessEnv, {
      get() {
        environmentReads += 1;
        return OPERATOR_VALUE;
      },
    });
    const controlled = makeDependencies(SUCCESS_RESULT, environment);
    const body: PreserveAndExtractUrlSourceHttpRequestBody = { submittedUrl: SUBMITTED_URL };
    const dependencies: PreserveAndExtractUrlSourceHttpHandlerDependencies =
      controlled.dependencies;
    const handler: PreserveAndExtractUrlSourceHttpHandler =
      createPreserveAndExtractUrlSourceHttpHandler(dependencies);

    expect(body).toEqual({ submittedUrl: SUBMITTED_URL });
    expect(handler).toBeTypeOf("function");
    expect(handler).toHaveLength(1);
    expect(environmentReads).toBe(0);
    expect(controlled.getRuntime).not.toHaveBeenCalled();
    expect(controlled.combined).not.toHaveBeenCalled();
  });

  it.each([null, "text/plain", "application/problem+json"])(
    "returns stable 415 for unsupported Content-Type %s before parsing or dependencies",
    async (contentType) => {
      let environmentReads = 0;
      const environment = new Proxy({} as NodeJS.ProcessEnv, {
        get() {
          environmentReads += 1;
          return OPERATOR_VALUE;
        },
      });
      const controlled = makeDependencies(SUCCESS_RESULT, environment);
      const request = makeRequest("not-json", contentType);
      const parse = vi.spyOn(request, "json");

      const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
        request,
      );

      await expectJsonResponse(response, 415, {
        ok: false,
        error: {
          code: "UNSUPPORTED_MEDIA_TYPE",
          message: "The request Content-Type must be application/json.",
        },
      });
      expect(parse).not.toHaveBeenCalled();
      expect(environmentReads).toBe(0);
      expect(controlled.getRuntime).not.toHaveBeenCalled();
    },
  );

  it.each([
    "application/json",
    "application/json; charset=utf-8",
    "Application/JSON ; charset=UTF-8",
  ])("accepts JSON media type %s", async (contentType) => {
    const controlled = makeDependencies();

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(undefined, contentType),
    );

    expect(response.status).toBe(201);
    expect(controlled.combined).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing body", null],
    ["malformed JSON", "{"],
  ] as const)(
    "returns exact 400 INVALID_JSON for %s without reading configuration or runtime",
    async (_label, body) => {
      let environmentReads = 0;
      const environment = new Proxy({} as NodeJS.ProcessEnv, {
        get() {
          environmentReads += 1;
          return OPERATOR_VALUE;
        },
      });
      const controlled = makeDependencies(SUCCESS_RESULT, environment);

      const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
        makeRequest(body),
      );

      await expectJsonResponse(response, 400, INVALID_JSON_BODY);
      expect(environmentReads).toBe(0);
      expect(controlled.getRuntime).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["null", null],
    ["array", []],
    ["primitive", "https://example.com"],
    ["missing property", {}],
    ["non-string property", { submittedUrl: 42 }],
  ])("returns exact 400 INVALID_REQUEST for %s", async (_label, body) => {
    let environmentReads = 0;
    const environment = new Proxy({} as NodeJS.ProcessEnv, {
      get() {
        environmentReads += 1;
        return OPERATOR_VALUE;
      },
    });
    const controlled = makeDependencies(SUCCESS_RESULT, environment);

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(JSON.stringify(body)),
    );

    await expectJsonResponse(response, 400, INVALID_REQUEST_BODY);
    expect(environmentReads).toBe(0);
    expect(controlled.getRuntime).not.toHaveBeenCalled();
  });

  it.each([
    "operatorId",
    "submittedBy",
    "requestedBy",
    "actor",
    "sourceId",
    "extractionId",
    "receivedAt",
    "canonicalUrl",
    "source",
    "providerData",
    "credentials",
    "retries",
    "transaction",
    "runtimeConfiguration",
  ])("rejects caller-supplied field %s", async (field) => {
    const controlled = makeDependencies();
    const body = { submittedUrl: SUBMITTED_URL, [field]: "caller-controlled" };

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(JSON.stringify(body)),
    );

    await expectJsonResponse(response, 400, INVALID_REQUEST_BODY);
    expect(controlled.getRuntime).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])(
    "returns generic 500 for missing or blank configured operator %s without runtime acquisition",
    async (configuredOperatorId) => {
      const environment =
        configuredOperatorId === undefined
          ? ({ NODE_ENV: "test" } as NodeJS.ProcessEnv)
          : ({
              NODE_ENV: "test",
              STORYRAIL_OPERATOR_ID: configuredOperatorId,
            } as NodeJS.ProcessEnv);
      const controlled = makeDependencies(SUCCESS_RESULT, environment);

      const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
        makeRequest(),
      );

      await expectJsonResponse(response, 500, INTERNAL_ERROR_BODY);
      expect(controlled.getRuntime).not.toHaveBeenCalled();
    },
  );

  it("passes the unchanged URL and exact configured operator actor to only the combined workflow", async () => {
    const controlled = makeDependencies();
    const requestBody = Object.freeze({ submittedUrl: SUBMITTED_URL });

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(JSON.stringify(requestBody)),
    );

    expect(response.status).toBe(201);
    expect(controlled.getRuntime).toHaveBeenCalledOnce();
    expect(controlled.combined).toHaveBeenCalledOnce();
    expect(controlled.combined).toHaveBeenCalledWith({
      submittedUrl: SUBMITTED_URL,
      submittedBy: {
        type: "operator",
        operatorId: operatorId(OPERATOR_VALUE),
      },
    });
    const command = controlled.combined.mock.calls[0]![0];
    expect(command.submittedUrl).toBe(SUBMITTED_URL);
    expect(command.submittedBy.type).toBe("operator");
    if (command.submittedBy.type !== "operator") {
      throw new Error("The HTTP handler must derive an operator actor.");
    }
    expect(command.submittedBy.operatorId).toBe(OPERATOR_VALUE);
    expect(Object.keys(command)).toEqual(["submittedUrl", "submittedBy"]);
    expect(Object.keys(command.submittedBy)).toEqual(["type", "operatorId"]);
    expect(controlled.preserve).not.toHaveBeenCalled();
    expect(controlled.extract).not.toHaveBeenCalled();
    expect(controlled.close).not.toHaveBeenCalled();
    expect(requestBody).toEqual({ submittedUrl: SUBMITTED_URL });
  });

  it("reads only the operator provenance value from server configuration", async () => {
    const reads: PropertyKey[] = [];
    const environment = new Proxy({} as NodeJS.ProcessEnv, {
      get(_target, property) {
        reads.push(property);
        return property === "STORYRAIL_OPERATOR_ID" ? OPERATOR_VALUE : undefined;
      },
    });
    const controlled = makeDependencies(SUCCESS_RESULT, environment);

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(),
    );

    expect(response.status).toBe(201);
    expect(reads).toEqual(["STORYRAIL_OPERATOR_ID"]);
  });

  it.each([
    ["successful extraction", SUCCESSFUL_EXTRACTION],
    ["durable expected provider failure", FAILED_EXTRACTION],
  ] as const)("returns complete %s as 201", async (_label, extraction) => {
    const result = Object.freeze({ ok: true, source: SOURCE, extraction } as const);
    const controlled = makeDependencies(result);

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(),
    );

    await expectJsonResponse(response, 201, result);
    expect(controlled.combined).toHaveBeenCalledOnce();
  });

  it.each([
    "SOURCE_URL_REQUIRED",
    "SOURCE_URL_TOO_LONG",
    "INVALID_SOURCE_URL",
    "UNSUPPORTED_SOURCE_PROTOCOL",
    "SOURCE_URL_CREDENTIALS_NOT_ALLOWED",
  ] as const)("maps preservation validation %s to 422 unchanged", async (code) => {
    const error = Object.freeze({
      code,
      message: "Controlled preservation validation failure.",
      ...(code === "SOURCE_URL_TOO_LONG" ? { maximumLength: 2048 } : {}),
    });
    const result = Object.freeze({
      ok: false,
      stage: "preservation",
      error,
    } as PreserveAndExtractUrlSourceResult);
    const controlled = makeDependencies(result);

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(),
    );

    await expectJsonResponse(response, 422, result);
  });

  it.each(["DUPLICATE_SOURCE", "SOURCE_ID_CONFLICT"] as const)(
    "maps preservation conflict %s to 409 unchanged",
    async (code) => {
      const error = Object.freeze({
        code,
        message: "Controlled preservation conflict.",
        ...(code === "DUPLICATE_SOURCE"
          ? { existingSourceId: sourceId("existing"), canonicalUrl: SOURCE.canonicalUrl }
          : { sourceId: SOURCE.id }),
      });
      const result = Object.freeze({
        ok: false,
        stage: "preservation",
        error,
      } as PreserveAndExtractUrlSourceResult);
      const controlled = makeDependencies(result);

      const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
        makeRequest(),
      );

      await expectJsonResponse(response, 409, result);
      expect(controlled.combined).toHaveBeenCalledOnce();
    },
  );

  it("maps extraction-stage failure to 500 with the preserved Source unchanged", async () => {
    const error = Object.freeze({
      code: "SOURCE_EXTRACTION_ID_CONFLICT",
      message: "Controlled extraction conflict.",
      extractionId: sourceExtractionId("conflict"),
    } as const);
    const result = Object.freeze({
      ok: false,
      stage: "extraction",
      source: SOURCE,
      error,
    } satisfies PreserveAndExtractUrlSourceResult);
    const controlled = makeDependencies(result);

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(),
    );

    await expectJsonResponse(response, 500, result);
    expect(result.source).toBe(SOURCE);
    expect(result.error).toBe(error);
  });

  it.each(["configuration", "runtime", "workflow"] as const)(
    "redacts unexpected %s failure with the exact generic 500 and no retry",
    async (failurePoint) => {
      const secret = `secret-like-${failurePoint}-detail`;
      const controlled = makeDependencies();
      let environment: NodeJS.ProcessEnv = controlled.dependencies.environment!;

      if (failurePoint === "configuration") {
        environment = {} as NodeJS.ProcessEnv;
        Object.defineProperty(environment, "STORYRAIL_OPERATOR_ID", {
          get() {
            throw new Error(secret);
          },
        });
      } else if (failurePoint === "runtime") {
        controlled.getRuntime.mockImplementation(() => {
          throw new Error(secret);
        });
      } else {
        controlled.combined.mockRejectedValue(new Error(secret));
      }

      const response = await createPreserveAndExtractUrlSourceHttpHandler({
        getRuntime: controlled.getRuntime,
        environment,
      })(makeRequest());
      const responseText = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.parse(responseText)).toEqual(INTERNAL_ERROR_BODY);
      expect(responseText).not.toContain(secret);
      expect(responseText).not.toContain("STORYRAIL_OPERATOR_ID");
      expect(responseText).not.toContain("stack");
      expect(controlled.getRuntime).toHaveBeenCalledTimes(failurePoint === "configuration" ? 0 : 1);
      expect(controlled.combined).toHaveBeenCalledTimes(failurePoint === "workflow" ? 1 : 0);
      expect(controlled.close).not.toHaveBeenCalled();
    },
  );

  it("does not mutate frozen application results, Sources, extractions, errors, actors, or commands", async () => {
    const controlled = makeDependencies();
    const commandSnapshots: unknown[] = [];
    controlled.combined.mockImplementation(async (command) => {
      commandSnapshots.push(command, command.submittedBy);
      Object.freeze(command.submittedBy);
      Object.freeze(command);
      return SUCCESS_RESULT;
    });

    const response = await createPreserveAndExtractUrlSourceHttpHandler(controlled.dependencies)(
      makeRequest(),
    );

    await expectJsonResponse(response, 201, SUCCESS_RESULT);
    expect(commandSnapshots).toHaveLength(2);
    expect(SUCCESS_RESULT.source).toBe(SOURCE);
    expect(SUCCESS_RESULT.extraction).toBe(SUCCESSFUL_EXTRACTION);
    expect(SOURCE.submittedBy).toBe(ACTOR);
    expect(Object.isFrozen(SUCCESS_RESULT)).toBe(true);
    expect(Object.isFrozen(SOURCE)).toBe(true);
    expect(Object.isFrozen(SUCCESSFUL_EXTRACTION)).toBe(true);
  });
});
