// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { FIRECRAWL_API_KEY_SLOT, OPENROUTER_API_KEY_SLOT, siteId } from "@/domain/editorial";

import {
  SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE,
  createSiteSettingsClient,
} from "./site-settings-client";

const SITE_ID = siteId("site-second");

const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

const MODELS = {
  evidencePreparation: "google/gemini-3.7-flash",
  assignmentEditor: "google/gemini-3.7-flash",
  writer: "google/gemini-3.7-flash",
  director: "google/gemini-3.7-flash",
  researcher: "google/gemini-3.7-flash",
} as const;

const SETTINGS_RESPONSE = {
  ok: true,
  settings: { models: MODELS },
  credentials: [
    { slot: "firecrawl_api_key", hint: "8569", updatedAt: "2026-08-23T19:36:27.512Z" },
    { slot: "openrouter_api_key", hint: "abee", updatedAt: "2026-08-23T19:36:17.426Z" },
  ],
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("site-settings-client", () => {
  it("accepts the exact settings response the live route returns", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, SETTINGS_RESPONSE));

    const result = await createSiteSettingsClient({ siteId: SITE_ID, fetch }).readSettings();

    expect(result).toEqual({
      kind: "completed",
      value: { settings: { models: MODELS }, credentials: SETTINGS_RESPONSE.credentials },
    });
    expect(fetch).toHaveBeenCalledWith("/api/sites/site-second/site-settings", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("refuses a settings response that is missing an agent role", async () => {
    const incomplete = Object.fromEntries(
      Object.entries(MODELS).filter(([role]) => role !== "researcher"),
    );
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response(200, { ok: true, settings: { models: incomplete }, credentials: [] }),
      );

    expect(await createSiteSettingsClient({ siteId: SITE_ID, fetch }).readSettings()).toEqual({
      kind: "unavailable",
      message: SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE,
    });
  });

  it("refuses a listed credential that carries anything beyond a slot, a hint and a time", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(200, {
        ok: true,
        settings: { models: MODELS },
        credentials: [
          {
            slot: "openrouter_api_key",
            hint: "abee",
            updatedAt: "2026-08-23T19:36:17.426Z",
            secret: "sk-or-v1-the-actual-key",
          },
        ],
      }),
    );

    expect(await createSiteSettingsClient({ siteId: SITE_ID, fetch }).readSettings()).toEqual({
      kind: "unavailable",
      message: SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE,
    });
  });

  it("sends the stored models with a destination so a whole settings document is written", async () => {
    const destination = {
      kind: "wordpress",
      baseUrl: "https://blog.example.com",
      username: "editor",
      draft: true,
    } as const;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, { ok: true, settings: { models: MODELS, destination } }));

    const result = await createSiteSettingsClient({ siteId: SITE_ID, fetch }).saveDestination(
      MODELS,
      destination,
    );

    expect(result).toEqual({ kind: "completed", value: { models: MODELS, destination } });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      models: MODELS,
      destination,
    });
  });

  it("clears a destination with an explicit null rather than by omitting it", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        response(200, { ok: true, settings: { models: MODELS, destination: null } }),
      );

    await createSiteSettingsClient({ siteId: SITE_ID, fetch }).saveDestination(MODELS, null);

    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect("destination" in body).toBe(true);
    expect(body.destination).toBeNull();
  });

  it("refuses a saved destination carrying the other kind's field", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(200, {
        ok: true,
        settings: {
          models: MODELS,
          destination: {
            kind: "wordpress",
            baseUrl: "https://blog.example.com",
            package: "@studiocms/markdown-remark",
            draft: true,
          },
        },
      }),
    );

    expect(
      await createSiteSettingsClient({ siteId: SITE_ID, fetch }).saveDestination(MODELS, null),
    ).toEqual({ kind: "unavailable", message: SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE });
  });

  it("sends a secret to its slot and keeps only the hint that comes back", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, { ok: true, slot: "openrouter_api_key", hint: "abee" }));

    const result = await createSiteSettingsClient({ siteId: SITE_ID, fetch }).setCredential(
      OPENROUTER_API_KEY_SLOT,
      "sk-or-v1-secret",
    );

    expect(result).toEqual({
      kind: "completed",
      value: { slot: "openrouter_api_key", hint: "abee" },
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/sites/site-second/site-credentials/openrouter_api_key",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ secret: "sk-or-v1-secret" }),
      },
    );
  });

  it("reports a rejected secret as an application failure rather than an outage", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(422, {
        ok: false,
        error: {
          code: "CREDENTIAL_SECRET_INVALID",
          message: "A credential must be between 1 and 4096 characters.",
        },
      }),
    );

    expect(
      await createSiteSettingsClient({ siteId: SITE_ID, fetch }).setCredential(
        OPENROUTER_API_KEY_SLOT,
        " ",
      ),
    ).toEqual({
      kind: "application-failure",
      error: {
        code: "CREDENTIAL_SECRET_INVALID",
        message: "A credential must be between 1 and 4096 characters.",
      },
    });
  });

  it("keeps the reason a credential is unusable rather than flattening it", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(503, {
        ok: false,
        error: {
          code: "OPENROUTER_API_KEY_REQUIRED",
          reason: "CREDENTIAL_UNREADABLE",
          slot: "openrouter_api_key",
          message: "The stored OpenRouter key could not be read.",
        },
      }),
    );

    expect(await createSiteSettingsClient({ siteId: SITE_ID, fetch }).saveModels(MODELS)).toEqual({
      kind: "credential-unavailable",
      error: {
        code: "OPENROUTER_API_KEY_REQUIRED",
        reason: "CREDENTIAL_UNREADABLE",
        slot: "openrouter_api_key",
        message: "The stored OpenRouter key could not be read.",
      },
    });
  });

  it("removes a credential by slot and reports a slot that held nothing", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response(200, { ok: true, slot: "firecrawl_api_key" }))
      .mockResolvedValueOnce(
        response(404, {
          ok: false,
          error: {
            code: "CREDENTIAL_NOT_CONFIGURED",
            message: "No credential is stored in that slot.",
          },
        }),
      );
    const client = createSiteSettingsClient({ siteId: SITE_ID, fetch });

    expect(await client.removeCredential(FIRECRAWL_API_KEY_SLOT)).toEqual({
      kind: "completed",
      value: "firecrawl_api_key",
    });
    expect(await client.removeCredential(FIRECRAWL_API_KEY_SLOT)).toMatchObject({
      kind: "application-failure",
      error: { code: "CREDENTIAL_NOT_CONFIGURED" },
    });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "/api/sites/site-second/site-credentials/firecrawl_api_key",
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
      },
    );
  });

  it("reports a network failure as unavailable rather than throwing at the screen", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));

    expect(await createSiteSettingsClient({ siteId: SITE_ID, fetch }).readSettings()).toEqual({
      kind: "unavailable",
      message: SITE_SETTINGS_REQUEST_UNAVAILABLE_MESSAGE,
    });
  });

  it("reads the settings through the default browser client", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, SETTINGS_RESPONSE));
    vi.stubGlobal("fetch", fetch);

    expect(
      await createSiteSettingsClient({ siteId: SITE_ID, fetch: globalThis.fetch }).readSettings(),
    ).toMatchObject({ kind: "completed" });
  });
});
