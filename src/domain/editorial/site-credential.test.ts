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
      settings: { models, destination: null, search: null },
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

  it("accepts a destination and normalises the address it will deliver to", () => {
    expect(
      recordSiteSettings({
        models,
        destination: {
          kind: "studiocms",
          baseUrl: "  https://newsroom.test/studiocms_api/rest/v1/  ",
          package: "studiocms/markdown",
          draft: true,
        },
      }),
    ).toEqual({
      ok: true,
      settings: {
        models,
        destination: {
          kind: "studiocms",
          baseUrl: "https://newsroom.test/studiocms_api/rest/v1",
          package: "studiocms/markdown",
          draft: true,
        },
        search: null,
      },
    });
  });

  it("accepts a WordPress destination and keeps its user out of the credential store", () => {
    expect(
      recordSiteSettings({
        models,
        destination: {
          kind: "wordpress",
          baseUrl: "https://newsroom.test/",
          username: "  storyrail  ",
          draft: false,
        },
      }),
    ).toEqual({
      ok: true,
      settings: {
        models,
        destination: {
          kind: "wordpress",
          baseUrl: "https://newsroom.test",
          username: "storyrail",
          draft: false,
        },
        search: null,
      },
    });
  });

  it("refuses a destination wearing the fields of a kind it is not", () => {
    // A renderer package means nothing to WordPress, so storing one would be a setting an
    // operator could fill in and watch do nothing.
    expect(
      recordSiteSettings({
        models,
        destination: {
          kind: "wordpress",
          baseUrl: "https://newsroom.test",
          package: "studiocms/markdown",
          draft: true,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_DESTINATION_INVALID" } });
  });

  it("refuses a destination that does not say which kind of website it is", () => {
    expect(
      recordSiteSettings({
        models,
        destination: {
          baseUrl: "https://newsroom.test",
          package: "studiocms/markdown",
          draft: true,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_DESTINATION_INVALID" } });
  });

  it("refuses a destination missing anything a delivery would need", () => {
    expect(
      recordSiteSettings({
        models,
        destination: { kind: "studiocms", baseUrl: "https://newsroom.test", draft: true },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_DESTINATION_INVALID" } });
  });

  it("refuses a destination carrying an author the destination would ignore", () => {
    // Pages are attributed to whoever owns the token. A stored author would be a setting an
    // operator could fill in and watch do nothing.
    expect(
      recordSiteSettings({
        models,
        destination: {
          kind: "studiocms",
          baseUrl: "https://newsroom.test",
          authorId: "author-1",
          package: "studiocms/markdown",
          draft: true,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_DESTINATION_INVALID" } });
  });

  it("refuses an address that is not absolute, so nothing resolves it against this process", () => {
    expect(
      recordSiteSettings({
        models,
        destination: {
          kind: "studiocms",
          baseUrl: "/studiocms_api/rest/v1",
          package: "studiocms/markdown",
          draft: true,
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_DESTINATION_INVALID" } });
  });

  it("treats a newsroom with nowhere to deliver as configured rather than broken", () => {
    expect(recordSiteSettings({ models, destination: null })).toMatchObject({
      ok: true,
      settings: { destination: null },
    });
  });

  it("accepts a search instance and normalises the address it will query", () => {
    expect(
      recordSiteSettings({
        models,
        search: { baseUrl: "  https://search.newsroom.test/  ", username: "  storyrail  " },
      }),
    ).toEqual({
      ok: true,
      settings: {
        models,
        destination: null,
        search: { baseUrl: "https://search.newsroom.test", username: "storyrail" },
      },
    });
  });

  it("refuses a search instance named without the user its password belongs to", () => {
    expect(
      recordSiteSettings({ models, search: { baseUrl: "https://search.newsroom.test" } }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_SEARCH_INVALID" } });
  });

  it("refuses a search instance reached at an address that is not absolute", () => {
    expect(
      recordSiteSettings({ models, search: { baseUrl: "/search", username: "storyrail" } }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_SEARCH_INVALID" } });
  });

  it("refuses a search instance carrying the password it must never store", () => {
    // The secret belongs in the encrypted store. A settings shape that accepted one would put a
    // password somewhere every settings read returns in plaintext.
    expect(
      recordSiteSettings({
        models,
        search: {
          baseUrl: "https://search.newsroom.test",
          username: "storyrail",
          password: "hunter2",
        },
      }),
    ).toMatchObject({ ok: false, error: { code: "SITE_SETTINGS_SEARCH_INVALID" } });
  });

  it("treats a newsroom that cannot search as configured rather than broken", () => {
    expect(recordSiteSettings({ models })).toMatchObject({
      ok: true,
      settings: { search: null },
    });
  });

  it.each([null, undefined, "models", 7, [], { models: [] }])(
    "refuses %j as settings",
    (candidate) => {
      expect(recordSiteSettings(candidate)).toMatchObject({ ok: false });
    },
  );
});
