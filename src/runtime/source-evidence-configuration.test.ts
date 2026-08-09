// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SourceEvidenceRuntimeConfigurationError,
  loadSourceEvidenceRuntimeConfiguration,
} from "./source-evidence-configuration";

const DATABASE_URL = "  opaque-database-configuration  ";
const FIRECRAWL_API_KEY = "  opaque-firecrawl-configuration  ";

function makeEnvironment(values: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return { ...values, NODE_ENV: "test" as const };
}

function captureConfigurationError(environment: NodeJS.ProcessEnv) {
  try {
    loadSourceEvidenceRuntimeConfiguration(environment);
  } catch (error) {
    expect(error).toBeInstanceOf(SourceEvidenceRuntimeConfigurationError);
    return error as SourceEvidenceRuntimeConfigurationError;
  }

  throw new Error("Expected Source-evidence runtime configuration loading to fail.");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadSourceEvidenceRuntimeConfiguration", () => {
  it("loads only the two approved values and preserves them exactly", () => {
    const reads: PropertyKey[] = [];
    const suppliedEnvironment = makeEnvironment({
      STORYRAIL_DATABASE_URL: DATABASE_URL,
      FIRECRAWL_API_KEY,
      UNRELATED_SECRET: "must-not-be-read",
    });
    const environment = new Proxy(suppliedEnvironment, {
      get(target, property, receiver) {
        reads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const before = structuredClone(suppliedEnvironment);

    const configuration = loadSourceEvidenceRuntimeConfiguration(environment);

    expect(configuration).toEqual({
      databaseUrl: DATABASE_URL,
      firecrawlApiKey: FIRECRAWL_API_KEY,
    });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(suppliedEnvironment).toEqual(before);
    expect(reads).toEqual(["STORYRAIL_DATABASE_URL", "FIRECRAWL_API_KEY"]);
  });

  it.each([undefined, "", " \t\n "])(
    "uses the safe database error for a missing or blank database URL (%j)",
    (databaseUrl) => {
      const error = captureConfigurationError(
        makeEnvironment({
          STORYRAIL_DATABASE_URL: databaseUrl,
          FIRECRAWL_API_KEY,
        }),
      );

      expect(error).toMatchObject({
        name: "SourceEvidenceRuntimeConfigurationError",
        code: "STORYRAIL_DATABASE_URL_REQUIRED",
        message: "STORYRAIL_DATABASE_URL is required.",
      });
    },
  );

  it("gives the database failure precedence when both variables are absent", () => {
    const error = captureConfigurationError(makeEnvironment());

    expect(error.code).toBe("STORYRAIL_DATABASE_URL_REQUIRED");
  });

  it.each([undefined, "", " \t\n "])(
    "uses the safe Firecrawl error for a missing or blank API key (%j)",
    (firecrawlApiKey) => {
      const error = captureConfigurationError(
        makeEnvironment({
          STORYRAIL_DATABASE_URL: DATABASE_URL,
          FIRECRAWL_API_KEY: firecrawlApiKey,
        }),
      );

      expect(error).toMatchObject({
        name: "SourceEvidenceRuntimeConfigurationError",
        code: "FIRECRAWL_API_KEY_REQUIRED",
        message: "FIRECRAWL_API_KEY is required.",
      });
    },
  );

  it("keeps configuration error messages free of values and diagnostics", () => {
    const rawDiagnostic = [
      DATABASE_URL,
      FIRECRAWL_API_KEY,
      "SELECT * FROM credentials",
      "# untrusted Markdown",
      JSON.stringify({ STORYRAIL_DATABASE_URL: DATABASE_URL, FIRECRAWL_API_KEY }),
      "at loadSourceEvidenceRuntimeConfiguration (runtime.ts:1:1)",
    ];
    const databaseError = captureConfigurationError(
      makeEnvironment({
        FIRECRAWL_API_KEY,
        RAW_DIAGNOSTIC: rawDiagnostic.join("\n"),
      }),
    );
    const firecrawlError = captureConfigurationError(
      makeEnvironment({
        STORYRAIL_DATABASE_URL: DATABASE_URL,
        RAW_DIAGNOSTIC: rawDiagnostic.join("\n"),
      }),
    );

    for (const error of [databaseError, firecrawlError]) {
      for (const forbidden of rawDiagnostic) {
        expect(error.message).not.toContain(forbidden);
      }
      expect(error.message).not.toContain("RAW_DIAGNOSTIC");
      expect(error.message).not.toContain("stack");
    }
  });

  it("does not consult ambient values when an environment object is supplied", () => {
    vi.stubEnv("STORYRAIL_DATABASE_URL", "ambient-database-url");
    vi.stubEnv("FIRECRAWL_API_KEY", "ambient-firecrawl-key");

    const error = captureConfigurationError(makeEnvironment());

    expect(error.code).toBe("STORYRAIL_DATABASE_URL_REQUIRED");
  });
});
