import { describe, expect, it } from "vitest";
import {
  loadWriterRuntimeConfiguration,
  WriterRuntimeConfigurationError,
} from "./writer-configuration";
import { resolveWriterModel } from "./writer-runtime";
import type { StructuredModel } from "@/application/model";

describe("Writer runtime configuration", () => {
  it("takes no OpenRouter key from the environment, because a key belongs to a Site", () => {
    expect(
      loadWriterRuntimeConfiguration({
        STORYRAIL_DATABASE_URL: "postgres://db",
        OPENROUTER_API_KEY: "key",
        STORYRAIL_WRITER_MODEL: "ignored/model",
      }),
    ).toEqual({ databaseUrl: "postgres://db", credentialKey: null });
  });
  it("starts without an encryption key, so an installation with no credentials still runs", () => {
    expect(loadWriterRuntimeConfiguration({ STORYRAIL_DATABASE_URL: "postgres://db" })).toEqual({
      databaseUrl: "postgres://db",
      credentialKey: null,
    });
  });
  it("requires the database URL only when the lazy runtime is created", () => {
    expect(() => loadWriterRuntimeConfiguration({})).toThrow(WriterRuntimeConfigurationError);
  });
  it("prefers a Profile OpenRouter model, falls back to the default, and rejects unsupported providers", () => {
    const createModel = (model: string): StructuredModel => ({
      descriptor: { provider: "openrouter", model },
      limits: { maximumInputCharacters: 60_000 },
      generateStructured: (async () => ({
        ok: false as const,
        failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
      })) as StructuredModel["generateStructured"],
    });
    expect(
      resolveWriterModel(
        { provider: "openrouter", model: "profile-model" },
        "default-model",
        createModel,
      ),
    ).toMatchObject({ ok: true, model: { descriptor: { model: "profile-model" } } });
    expect(resolveWriterModel(null, "default-model", createModel)).toMatchObject({
      ok: true,
      model: { descriptor: { model: "default-model" } },
    });
    expect(
      resolveWriterModel(
        { provider: "future-provider", model: "model" },
        "default-model",
        createModel,
      ),
    ).toMatchObject({ ok: false, error: { code: "WRITER_MODEL_UNSUPPORTED" } });
  });
});
