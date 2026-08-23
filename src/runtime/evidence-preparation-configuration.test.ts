import { describe, expect, it } from "vitest";

import {
  EvidencePreparationRuntimeConfigurationError,
  loadEvidencePreparationRuntimeConfiguration,
} from "./evidence-preparation-configuration";

describe("evidence preparation runtime configuration", () => {
  it("loads only the database URL and the encryption key", () => {
    expect(
      loadEvidencePreparationRuntimeConfiguration({
        NODE_ENV: "test",
        STORYRAIL_DATABASE_URL: "postgres://storyrail",
        STORYRAIL_CREDENTIAL_KEY: "base64-key",
        OPENROUTER_API_KEY: "secret",
        STORYRAIL_EVIDENCE_PREPARATION_MODEL: "operator/model",
        FIRECRAWL_API_KEY: "not-required-by-this-runtime",
      }),
    ).toEqual({ databaseUrl: "postgres://storyrail", credentialKey: "base64-key" });
  });

  it("requires the database URL without revealing any other value", () => {
    try {
      loadEvidencePreparationRuntimeConfiguration({
        NODE_ENV: "test",
        OPENROUTER_API_KEY: "secret",
      });
      throw new Error("Expected evidence preparation configuration to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(EvidencePreparationRuntimeConfigurationError);
      expect(error).toMatchObject({
        name: "EvidencePreparationRuntimeConfigurationError",
        code: "STORYRAIL_DATABASE_URL_REQUIRED",
        message: "STORYRAIL_DATABASE_URL is required.",
      });
    }
  });
});
