import { describe, expect, it } from "vitest";
import type { StructuredModel } from "@/application/model";
import {
  DirectorRuntimeConfigurationError,
  loadDirectorRuntimeConfiguration,
} from "./director-configuration";
import { resolveDirectorModel } from "./director-runtime";

const createModel = (model: string): StructuredModel => ({
  descriptor: { provider: "openrouter", model },
  limits: { maximumInputCharacters: 60_000 },
  generateStructured: (async () => ({
    ok: false as const,
    failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
  })) as StructuredModel["generateStructured"],
});

describe("Director runtime configuration", () => {
  it("carries the encryption key and no credential of its own", () => {
    expect(
      loadDirectorRuntimeConfiguration({
        STORYRAIL_DATABASE_URL: "postgres://db",
        STORYRAIL_CREDENTIAL_KEY: "  base64-key  ",
        OPENROUTER_API_KEY: "key",
      }),
    ).toEqual({ databaseUrl: "postgres://db", credentialKey: "base64-key" });
  });

  it("requires the database URL only when constructed", () => {
    expect(() => loadDirectorRuntimeConfiguration({})).toThrow(DirectorRuntimeConfigurationError);
  });

  it("uses the exact Profile model before the newsroom's configured default", () => {
    expect(
      resolveDirectorModel(
        { provider: "openrouter", model: "profile-model" },
        "default-model",
        createModel,
      ),
    ).toMatchObject({ ok: true, model: { descriptor: { model: "profile-model" } } });
    expect(resolveDirectorModel(null, "default-model", createModel)).toMatchObject({
      ok: true,
      model: { descriptor: { model: "default-model" } },
    });
  });

  it("rejects unsupported providers and missing defaults", () => {
    expect(
      resolveDirectorModel({ provider: "other", model: "model" }, "default", createModel),
    ).toMatchObject({ ok: false, error: { code: "DIRECTOR_MODEL_UNSUPPORTED" } });
    expect(resolveDirectorModel(null, null, createModel)).toMatchObject({
      ok: false,
      error: { code: "DIRECTOR_MODEL_UNAVAILABLE" },
    });
  });
});
