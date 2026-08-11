import { describe, expect, it } from "vitest";

import { loadAssignmentEditorRuntimeConfiguration } from "./assignment-editor-configuration";

describe("Assignment Editor runtime configuration", () => {
  it("loads and preserves the three explicit runtime values", () => {
    expect(
      loadAssignmentEditorRuntimeConfiguration({
        NODE_ENV: "test",
        STORYRAIL_DATABASE_URL: "postgresql://storyrail",
        OPENROUTER_API_KEY: "secret",
        STORYRAIL_ASSIGNMENT_EDITOR_MODEL: "provider/model",
        STORYRAIL_EVIDENCE_PREPARATION_MODEL: "different/model",
      }),
    ).toEqual({
      databaseUrl: "postgresql://storyrail",
      openRouterApiKey: "secret",
      model: "provider/model",
    });
  });

  it.each([
    ["STORYRAIL_DATABASE_URL", "STORYRAIL_DATABASE_URL_REQUIRED"],
    ["OPENROUTER_API_KEY", "OPENROUTER_API_KEY_REQUIRED"],
    ["STORYRAIL_ASSIGNMENT_EDITOR_MODEL", "STORYRAIL_ASSIGNMENT_EDITOR_MODEL_REQUIRED"],
  ] as const)("requires non-blank %s", (variable, code) => {
    const environment = {
      NODE_ENV: "test" as const,
      STORYRAIL_DATABASE_URL: "database",
      OPENROUTER_API_KEY: "key",
      STORYRAIL_ASSIGNMENT_EDITOR_MODEL: "model",
      [variable]: " ",
    };
    expect(() => loadAssignmentEditorRuntimeConfiguration(environment)).toThrowError(
      expect.objectContaining({ code }),
    );
  });
});
