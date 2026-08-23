import { describe, expect, it } from "vitest";

import { credentialHint, parseCredentialSlot } from "./site-credential";
import { recordSiteSettings } from "./site-settings";

describe("credential slots", () => {
  it.each(["openrouter_api_key", "firecrawl_api_key", "wordpress_application_password", "a1_b2"])(
    "accepts %s, so a new connector needs no change here",
    (candidate) => {
      expect(parseCredentialSlot(candidate)).toEqual({ ok: true, slot: candidate });
    },
  );

  it.each(["", "   ", "OpenRouter", "open router", "open-router", "_leading", "trailing_", "9key"])(
    "refuses %j as a slot name",
    (candidate) => {
      expect(parseCredentialSlot(candidate)).toMatchObject({
        ok: false,
        error: { code: "CREDENTIAL_SLOT_INVALID" },
      });
    },
  );

  it("trims a slot rather than storing one that only looks like another", () => {
    expect(parseCredentialSlot("  openrouter_api_key  ")).toEqual({
      ok: true,
      slot: "openrouter_api_key",
    });
  });
});

describe("credential hints", () => {
  it("gives up exactly the last four characters of a long secret", () => {
    expect(credentialHint("sk-or-v1-abcdefgh7f3a")).toBe("7f3a");
  });

  it("gives up nothing at all when the secret is short enough to guess from four", () => {
    expect(credentialHint("12345678")).toBe("");
  });
});

describe("per-Site settings", () => {
  const models = {
    evidencePreparation: "provider/one",
    assignmentEditor: "provider/two",
    writer: "provider/three",
    director: "provider/four",
    researcher: "provider/five",
  };

  it("accepts a model for every role and trims what it stores", () => {
    expect(recordSiteSettings({ models: { ...models, writer: "  provider/three  " } })).toEqual({
      ok: true,
      settings: { models },
    });
  });

  it("refuses settings that leave a role without a model", () => {
    const incomplete = Object.fromEntries(
      Object.entries(models).filter(([role]) => role !== "writer"),
    );

    expect(recordSiteSettings({ models: incomplete })).toMatchObject({
      ok: false,
      error: { code: "SITE_SETTINGS_MODELS_INVALID" },
    });
  });

  it("refuses a blank model rather than storing a run that will fail at the provider", () => {
    expect(recordSiteSettings({ models: { ...models, director: "   " } })).toMatchObject({
      ok: false,
      error: { code: "SITE_SETTINGS_MODELS_INVALID" },
    });
  });

  it("refuses settings carrying anything the newsroom did not ask for", () => {
    expect(
      recordSiteSettings({ models: { ...models, openRouterApiKey: "sk-or-v1-smuggled" } }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_MODELS_INVALID" } });
  });

  it.each([null, undefined, "models", 7, [], { models: [] }])(
    "refuses %j as settings",
    (candidate) => {
      expect(recordSiteSettings(candidate)).toMatchObject({ ok: false });
    },
  );
});
