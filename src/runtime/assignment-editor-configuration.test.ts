import { describe, expect, it } from "vitest";

import {
  AssignmentEditorRuntimeConfigurationError,
  loadAssignmentEditorRuntimeConfiguration,
} from "./assignment-editor-configuration";

describe("Assignment Editor runtime configuration", () => {
  it("reads nothing but the database URL and the encryption key", () => {
    expect(
      loadAssignmentEditorRuntimeConfiguration({
        NODE_ENV: "test",
        STORYRAIL_DATABASE_URL: "postgresql://storyrail",
        STORYRAIL_CREDENTIAL_KEY: "base64-key",
        OPENROUTER_API_KEY: "secret",
        STORYRAIL_ASSIGNMENT_EDITOR_MODEL: "provider/model",
      }),
    ).toEqual({ databaseUrl: "postgresql://storyrail", credentialKey: "base64-key" });
  });

  it("builds without a model, because the model is a per-Site setting now", () => {
    expect(
      loadAssignmentEditorRuntimeConfiguration({
        NODE_ENV: "test",
        STORYRAIL_DATABASE_URL: "postgresql://storyrail",
      }),
    ).toEqual({ databaseUrl: "postgresql://storyrail", credentialKey: null });
  });

  it("requires a non-blank database URL", () => {
    expect(() =>
      loadAssignmentEditorRuntimeConfiguration({ NODE_ENV: "test", STORYRAIL_DATABASE_URL: " " }),
    ).toThrowError(expect.objectContaining({ code: "STORYRAIL_DATABASE_URL_REQUIRED" }));
    expect(() => loadAssignmentEditorRuntimeConfiguration({ NODE_ENV: "test" })).toThrow(
      AssignmentEditorRuntimeConfigurationError,
    );
  });
});
