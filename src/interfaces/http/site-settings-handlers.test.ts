// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { OPENROUTER_API_KEY_SLOT } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

import {
  createReadSiteSettingsHttpHandler,
  createRemoveSiteCredentialHttpHandler,
  createSetSiteCredentialHttpHandler,
  createUpdateSiteSettingsHttpHandler,
} from "./site-settings-handlers";

const SECRET = "sk-or-v1-never-leaves-the-store-7f3a";

const MODELS = {
  evidencePreparation: "provider/one",
  assignmentEditor: "provider/two",
  writer: "provider/three",
  director: "provider/four",
  researcher: "provider/five",
};

function runtimeWith(overrides: Partial<StoryRuntime>): StoryRuntime {
  return {
    readSiteSettings: vi.fn(async () => ({
      settings: { models: MODELS, destination: null },
      credentials: [
        { slot: OPENROUTER_API_KEY_SLOT, hint: "7f3a", updatedAt: "2026-08-23T00:00:00.000Z" },
      ],
    })),
    updateSiteSettings: vi.fn(async () => ({
      ok: true as const,
      settings: { models: MODELS, destination: null },
    })),
    setSiteCredential: vi.fn(async () => ({
      ok: true as const,
      slot: OPENROUTER_API_KEY_SLOT,
      hint: "7f3a",
    })),
    removeSiteCredential: vi.fn(async () => true),
    ...overrides,
  } as unknown as StoryRuntime;
}

const context = { params: Promise.resolve({ slot: "openrouter_api_key" }) };

function jsonRequest(body: unknown, method = "PUT") {
  return new Request("https://storyrail.test/api/site-settings", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("reading the settings a newsroom runs on", () => {
  it("reports which credentials are configured by hint and never by value", async () => {
    const response = await createReadSiteSettingsHttpHandler({
      getRuntime: () => runtimeWith({}),
    })();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      ok: true,
      settings: { models: MODELS, destination: null },
      credentials: [
        { slot: "openrouter_api_key", hint: "7f3a", updatedAt: "2026-08-23T00:00:00.000Z" },
      ],
    });
    expect(body).not.toContain(SECRET);
    expect(body).not.toContain("ciphertext");
  });

  it("does not cache a settings response", async () => {
    const response = await createReadSiteSettingsHttpHandler({
      getRuntime: () => runtimeWith({}),
    })();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("changing the settings a newsroom runs on", () => {
  it("stores the models an operator chose and reflects them back", async () => {
    const updateSiteSettings = vi.fn(async () => ({
      ok: true as const,
      settings: { models: MODELS, destination: null },
    }));
    const response = await createUpdateSiteSettingsHttpHandler({
      getRuntime: () => runtimeWith({ updateSiteSettings }),
    })(jsonRequest({ models: MODELS }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      settings: { models: MODELS, destination: null },
    });
    expect(updateSiteSettings).toHaveBeenCalledWith({ models: MODELS });
  });

  it("refuses settings the newsroom cannot run on with 422", async () => {
    const response = await createUpdateSiteSettingsHttpHandler({
      getRuntime: () =>
        runtimeWith({
          updateSiteSettings: vi.fn(async () => ({
            ok: false as const,
            error: { code: "SITE_SETTINGS_MODELS_INVALID", message: "invalid" },
          })),
        }),
    })(jsonRequest({ models: {} }));

    expect(response.status).toBe(422);
  });

  it("refuses a body that is not JSON", async () => {
    const response = await createUpdateSiteSettingsHttpHandler({
      getRuntime: () => runtimeWith({}),
    })(
      new Request("https://storyrail.test/api/site-settings", {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: "models",
      }),
    );

    expect(response.status).toBe(415);
  });
});

describe("storing a credential over HTTP", () => {
  it("answers with the hint and never echoes the secret it was sent", async () => {
    const setSiteCredential = vi.fn(async () => ({
      ok: true as const,
      slot: OPENROUTER_API_KEY_SLOT,
      hint: "7f3a",
    }));
    const response = await createSetSiteCredentialHttpHandler({
      getRuntime: () => runtimeWith({ setSiteCredential }),
    })(jsonRequest({ secret: SECRET }), context);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ ok: true, slot: "openrouter_api_key", hint: "7f3a" });
    expect(body).not.toContain(SECRET);
  });

  it("refuses a slot name that is not a slot", async () => {
    const response = await createSetSiteCredentialHttpHandler({
      getRuntime: () => runtimeWith({}),
    })(jsonRequest({ secret: SECRET }), { params: Promise.resolve({ slot: "Open Router" }) });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_SLOT_INVALID" },
    });
  });

  it("refuses a body carrying anything besides the secret", async () => {
    const setSiteCredential = vi.fn();
    const response = await createSetSiteCredentialHttpHandler({
      getRuntime: () => runtimeWith({ setSiteCredential }),
    })(jsonRequest({ secret: SECRET, hint: "7f3a" }), context);

    expect(response.status).toBe(400);
    expect(setSiteCredential).not.toHaveBeenCalled();
  });

  it("reports an installation with no encryption key rather than storing an unreadable row", async () => {
    const response = await createSetSiteCredentialHttpHandler({
      getRuntime: () =>
        runtimeWith({
          setSiteCredential: vi.fn(async () => ({
            ok: false as const,
            error: { code: "CREDENTIAL_KEY_UNAVAILABLE" as const, message: "no key" },
          })),
        }),
    })(jsonRequest({ secret: SECRET }), context);

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "CREDENTIAL_KEY_UNAVAILABLE" },
    });
  });
});

describe("removing a credential over HTTP", () => {
  it("removes the credential in the named slot", async () => {
    const removeSiteCredential = vi.fn(async () => true);
    const response = await createRemoveSiteCredentialHttpHandler({
      getRuntime: () => runtimeWith({ removeSiteCredential }),
    })(jsonRequest({}, "DELETE"), context);

    expect(response.status).toBe(200);
    expect(removeSiteCredential).toHaveBeenCalledWith("openrouter_api_key");
  });

  it("reports an empty slot as not found rather than as removed", async () => {
    const response = await createRemoveSiteCredentialHttpHandler({
      getRuntime: () => runtimeWith({ removeSiteCredential: vi.fn(async () => false) }),
    })(jsonRequest({}, "DELETE"), context);

    expect(response.status).toBe(404);
  });
});

describe("the credential routes as a whole", () => {
  it("offers no way to read a stored credential back", async () => {
    const handlers = await import("./site-settings-handlers");

    expect(Object.keys(handlers).filter((name) => /Credential/.test(name))).toEqual([
      "createSetSiteCredentialHttpHandler",
      "createRemoveSiteCredentialHttpHandler",
    ]);
  });
});
