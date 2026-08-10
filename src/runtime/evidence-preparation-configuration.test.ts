import { describe, expect, it } from "vitest";

import {
  EvidencePreparationRuntimeConfigurationError,
  loadEvidencePreparationRuntimeConfiguration,
} from "./evidence-preparation-configuration";

describe("evidence preparation runtime configuration", () => {
  it("loads only the database, OpenRouter key, and operator-selected model", () => {
    expect(
      loadEvidencePreparationRuntimeConfiguration({
        NODE_ENV: "test",
        STORYRAIL_DATABASE_URL: "postgres://storyrail",
        OPENROUTER_API_KEY: "secret",
        STORYRAIL_EVIDENCE_PREPARATION_MODEL: "operator/model",
        FIRECRAWL_API_KEY: "not-required-by-this-runtime",
      }),
    ).toEqual({
      databaseUrl: "postgres://storyrail",
      openRouterApiKey: "secret",
      model: "operator/model",
    });
  });

  it.each([
    ["STORYRAIL_DATABASE_URL", "STORYRAIL_DATABASE_URL_REQUIRED"],
    ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_REQUIRED"],
    ["STORYRAIL_EVIDENCE_PREPARATION_MODEL", "STORYRAIL_EVIDENCE_PREPARATION_MODEL_REQUIRED"],
  ] as const)("requires %s without revealing values", (missing, code) => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      STORYRAIL_DATABASE_URL: "postgres://storyrail",
      OPENROUTER_API_KEY: "secret",
      STORYRAIL_EVIDENCE_PREPARATION_MODEL: "operator/model",
    };
    delete environment[missing];
    try {
      loadEvidencePreparationRuntimeConfiguration(environment);
      throw new Error("Expected evidence preparation configuration to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(EvidencePreparationRuntimeConfigurationError);
      expect(error).toMatchObject({
        name: "EvidencePreparationRuntimeConfigurationError",
        code,
      });
    }
  });
});
