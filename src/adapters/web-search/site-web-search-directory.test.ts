import { describe, expect, it, vi } from "vitest";

import type { SiteSettingsRepository } from "@/application/site-settings";
import {
  SEARXNG_PASSWORD_SLOT,
  type ApiKeyResolution,
  type CredentialSlot,
  type SiteModelIds,
  type SiteSettings,
} from "@/domain/editorial";

import { createSiteWebSearchDirectory } from "./site-web-search-directory";

const MODELS: SiteModelIds = {
  evidencePreparation: "provider/one",
  assignmentEditor: "provider/two",
  writer: "provider/three",
  director: "provider/four",
  researcher: "provider/five",
};

const CONFIGURED: SiteSettings = {
  models: MODELS,
  destination: null,
  research: null,
  search: { baseUrl: "https://search.newsroom.test", username: "storyrail" },
};

function settings(value: SiteSettings | null): SiteSettingsRepository {
  return { find: async () => value, update: async () => undefined };
}

const present: ApiKeyResolution = { ok: true, apiKey: "hunter2" };
const missing: ApiKeyResolution = {
  ok: false,
  error: {
    code: "CREDENTIAL_NOT_CONFIGURED",
    reason: "CREDENTIAL_NOT_CONFIGURED",
    slot: SEARXNG_PASSWORD_SLOT,
    message: "No search password is configured.",
  },
};

describe("Site web search directory", () => {
  it("hands back a search instance when the newsroom has configured one", async () => {
    const resolveApiKey = vi.fn(async () => present);

    const provider = await createSiteWebSearchDirectory({
      settings: settings(CONFIGURED),
      resolveApiKey,
    })();

    expect(provider).not.toBeNull();
    expect(resolveApiKey).toHaveBeenCalledWith(SEARXNG_PASSWORD_SLOT);
  });

  it("leaves a newsroom that has configured no instance without one", async () => {
    const resolveApiKey = vi.fn(async () => present);

    await expect(
      createSiteWebSearchDirectory({
        settings: settings({ models: MODELS, destination: null, search: null, research: null }),
        resolveApiKey,
      })(),
    ).resolves.toBeNull();
    // The password is never read for a newsroom that has nowhere to send it.
    expect(resolveApiKey).not.toHaveBeenCalled();
  });

  it("leaves a newsroom whose password cannot be read without one", async () => {
    await expect(
      createSiteWebSearchDirectory({
        settings: settings(CONFIGURED),
        resolveApiKey: async () => missing,
      })(),
    ).resolves.toBeNull();
  });

  it("reads the configuration each time rather than the one the process started with", async () => {
    const find = vi
      .fn<() => Promise<SiteSettings | null>>()
      .mockResolvedValueOnce({ models: MODELS, destination: null, search: null, research: null })
      .mockResolvedValueOnce(CONFIGURED);
    const resolve = createSiteWebSearchDirectory({
      settings: { find, update: async () => undefined },
      resolveApiKey: async () => present,
    });

    await expect(resolve()).resolves.toBeNull();
    await expect(resolve()).resolves.not.toBeNull();
  });

  it("does not resolve a credential slot belonging to another connector", async () => {
    const slots: CredentialSlot[] = [];

    await createSiteWebSearchDirectory({
      settings: settings(CONFIGURED),
      resolveApiKey: async (slot) => {
        slots.push(slot);
        return present;
      },
    })();

    expect(slots).toEqual([SEARXNG_PASSWORD_SLOT]);
  });
});
