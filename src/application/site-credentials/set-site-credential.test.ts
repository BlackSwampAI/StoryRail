import { describe, expect, it, vi } from "vitest";

import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import {
  OPENROUTER_API_KEY_SLOT,
  siteId,
  type ConfiguredCredential,
  type EncryptedCredential,
} from "@/domain/editorial";

import { createSetSiteCredential } from "./set-site-credential";
import type { SiteCredentialRepository } from "./site-credential-repository";

const SITE = siteId("site-default");
const KEY = Buffer.alloc(32, 5).toString("base64");
const SECRET = "sk-or-v1-secret-value-7f3a";

function recordingRepository() {
  const written: EncryptedCredential[] = [];
  const repository: SiteCredentialRepository = {
    findBySlot: vi.fn(async () => written.at(-1) ?? null),
    upsert: vi.fn(async ({ credential }) => {
      written.push(credential);
    }),
    remove: vi.fn(async () => true),
    listConfigured: vi.fn(async (): Promise<readonly ConfiguredCredential[]> => []),
  };
  return { repository, written };
}

describe("storing a credential for a Site", () => {
  it("answers with a hint and never with the secret it was given", async () => {
    const { repository, written } = recordingRepository();
    const set = createSetSiteCredential({
      credentials: repository,
      siteId: SITE,
      cipher: createAesGcmCredentialCipher({ key: KEY }),
      now: () => "2026-08-23T00:00:00.000Z",
    });

    const result = await set({ slot: OPENROUTER_API_KEY_SLOT, secret: SECRET });

    expect(result).toEqual({ ok: true, slot: OPENROUTER_API_KEY_SLOT, hint: "7f3a" });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(written)).not.toContain(SECRET);
  });

  it("refuses a blank secret before anything is written", async () => {
    const { repository } = recordingRepository();
    const set = createSetSiteCredential({
      credentials: repository,
      siteId: SITE,
      cipher: createAesGcmCredentialCipher({ key: KEY }),
      now: () => "2026-08-23T00:00:00.000Z",
    });

    await expect(set({ slot: OPENROUTER_API_KEY_SLOT, secret: "   " })).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_SECRET_INVALID" },
    });
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it("refuses to store anything at all when there is no encryption key", async () => {
    const { repository } = recordingRepository();
    const set = createSetSiteCredential({
      credentials: repository,
      siteId: SITE,
      cipher: null,
      now: () => "2026-08-23T00:00:00.000Z",
    });

    await expect(set({ slot: OPENROUTER_API_KEY_SLOT, secret: SECRET })).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_KEY_UNAVAILABLE" },
    });
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
