import { describe, expect, it } from "vitest";

import type { SiteSettingsRepository } from "@/application/site-settings";
import {
  credentialUnavailable,
  STUDIOCMS_API_TOKEN_SLOT,
  WORDPRESS_APPLICATION_PASSWORD_SLOT,
  type ApiKeyResolution,
  type SiteSettings,
} from "@/domain/editorial";

import { createSiteDeliveryDestinationDirectory } from "./site-delivery-destination-directory";

const MODELS = {
  evidencePreparation: "provider/one",
  assignmentEditor: "provider/two",
  writer: "provider/three",
  director: "provider/four",
  researcher: "provider/five",
};

function settings(value: SiteSettings | null): SiteSettingsRepository {
  return { find: async () => value, update: async () => undefined };
}

const CONFIGURED: SiteSettings = {
  models: MODELS,
  destination: {
    kind: "studiocms",
    baseUrl: "https://newsroom.test/studiocms_api/rest/v1",
    package: "studiocms/markdown",
    draft: true,
  },
};

const WORDPRESS: SiteSettings = {
  models: MODELS,
  destination: {
    kind: "wordpress",
    baseUrl: "https://newsroom.test",
    username: "storyrail",
    draft: false,
  },
};

describe("resolving the destination a newsroom delivers to", () => {
  it("reads the slot belonging to the kind of website the newsroom delivers to", async () => {
    const reads: string[] = [];
    const directory = createSiteDeliveryDestinationDirectory({
      settings: settings(WORDPRESS),
      resolveApiKey: async (slot): Promise<ApiKeyResolution> => {
        reads.push(slot);
        return { ok: true, apiKey: "password-1" };
      },
    });

    await expect(directory.resolve()).resolves.toMatchObject({
      ok: true,
      destination: { name: "wordpress", draft: false },
    });
    expect(reads).toEqual([WORDPRESS_APPLICATION_PASSWORD_SLOT]);
  });

  it("names the missing application password rather than offering a WordPress destination", async () => {
    const directory = createSiteDeliveryDestinationDirectory({
      settings: settings(WORDPRESS),
      resolveApiKey: async (slot) => ({
        ok: false,
        error: credentialUnavailable(slot, "CREDENTIAL_NOT_CONFIGURED", "Nothing is stored."),
      }),
    });

    await expect(directory.resolve()).resolves.toMatchObject({
      ok: false,
      error: {
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: WORDPRESS_APPLICATION_PASSWORD_SLOT,
      },
    });
  });

  it("reads the token when a delivery is asked for, not when the runtime is built", async () => {
    const reads: string[] = [];
    const directory = createSiteDeliveryDestinationDirectory({
      settings: settings(CONFIGURED),
      resolveApiKey: async (slot): Promise<ApiKeyResolution> => {
        reads.push(slot);
        return { ok: true, apiKey: "token-1" };
      },
    });

    expect(reads).toEqual([]);
    await expect(directory.resolve()).resolves.toMatchObject({
      ok: true,
      destination: { name: "studiocms", draft: true },
    });
    expect(reads).toEqual([STUDIOCMS_API_TOKEN_SLOT]);
  });

  it("names the missing token rather than offering a destination that cannot deliver", async () => {
    const directory = createSiteDeliveryDestinationDirectory({
      settings: settings(CONFIGURED),
      resolveApiKey: async (slot) => ({
        ok: false,
        error: credentialUnavailable(slot, "CREDENTIAL_NOT_CONFIGURED", "Nothing is stored."),
      }),
    });

    await expect(directory.resolve()).resolves.toMatchObject({
      ok: false,
      error: { reason: "CREDENTIAL_NOT_CONFIGURED", slot: STUDIOCMS_API_TOKEN_SLOT },
    });
  });

  it("does not read a token for a newsroom with nowhere to deliver", async () => {
    let asked = false;
    const directory = createSiteDeliveryDestinationDirectory({
      settings: settings({ models: MODELS, destination: null }),
      resolveApiKey: async () => {
        asked = true;
        return { ok: true, apiKey: "token-1" };
      },
    });

    await expect(directory.resolve()).resolves.toMatchObject({
      ok: false,
      error: { code: "DESTINATION_NOT_CONFIGURED" },
    });
    expect(asked).toBe(false);
  });
});
