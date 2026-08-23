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
  it("loads only the database URL and the encryption key, and leaves the environment alone", () => {
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

    expect(configuration).toEqual({ databaseUrl: DATABASE_URL.trim(), credentialKey: null });
    expect(Object.isFrozen(configuration)).toBe(true);
    expect(suppliedEnvironment).toEqual(before);
    // Firecrawl is conspicuously absent: the key is a per-Site credential now, and a runtime
    // that read it here would hand the same key to every newsroom the installation runs.
    expect(reads).toEqual(["STORYRAIL_DATABASE_URL", "STORYRAIL_CREDENTIAL_KEY"]);
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
    for (const error of [databaseError]) {
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
