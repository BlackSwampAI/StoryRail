import { describe, expect, it, vi } from "vitest";

import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import {
  OPENROUTER_API_KEY_SLOT,
  siteId,
  type ConfiguredCredential,
  type EncryptedCredential,
} from "@/domain/editorial";

import { createResolveCredential } from "./resolve-credential";
import type { SiteCredentialRepository } from "./site-credential-repository";

const SITE = siteId("site-default");
const KEY = Buffer.alloc(32, 5).toString("base64");
const SECRET = "sk-or-v1-secret-value-7f3a";

function repositoryHolding(credential: EncryptedCredential | null): SiteCredentialRepository {
  return {
    findBySlot: vi.fn(async () => credential),
    upsert: vi.fn(async () => undefined),
    remove: vi.fn(async () => credential !== null),
    listConfigured: vi.fn(async (): Promise<readonly ConfiguredCredential[]> => []),
  };
}

describe("resolving a stored credential", () => {
  it("returns the secret a newsroom stored", async () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });
    const resolve = createResolveCredential({
      credentials: repositoryHolding(
        cipher.encrypt(SECRET, { siteId: SITE, slot: OPENROUTER_API_KEY_SLOT }),
      ),
      siteId: SITE,
      cipher,
    });

    await expect(resolve(OPENROUTER_API_KEY_SLOT)).resolves.toEqual({ ok: true, secret: SECRET });
  });

  it("names the OpenRouter key as required when the slot is empty, and says why", async () => {
    const resolve = createResolveCredential({
      credentials: repositoryHolding(null),
      siteId: SITE,
      cipher: createAesGcmCredentialCipher({ key: KEY }),
    });

    await expect(resolve(OPENROUTER_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "OPENROUTER_API_KEY_REQUIRED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: OPENROUTER_API_KEY_SLOT,
      },
    });
  });

  it("tells an operator whose encryption key changed apart from one who set nothing", async () => {
    const stored = createAesGcmCredentialCipher({ key: KEY }).encrypt(SECRET, {
      siteId: SITE,
      slot: OPENROUTER_API_KEY_SLOT,
    });
    const resolve = createResolveCredential({
      credentials: repositoryHolding(stored),
      siteId: SITE,
      cipher: createAesGcmCredentialCipher({ key: Buffer.alloc(32, 6).toString("base64") }),
    });

    await expect(resolve(OPENROUTER_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE", reason: "CREDENTIAL_UNREADABLE" },
    });
  });

  it("names the missing encryption key when a credential exists and nothing can open it", async () => {
    const stored = createAesGcmCredentialCipher({ key: KEY }).encrypt(SECRET, {
      siteId: SITE,
      slot: OPENROUTER_API_KEY_SLOT,
    });
    const resolve = createResolveCredential({
      credentials: repositoryHolding(stored),
      siteId: SITE,
      cipher: null,
    });

    const result = await resolve(OPENROUTER_API_KEY_SLOT);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_KEY_UNAVAILABLE", reason: "CREDENTIAL_KEY_UNAVAILABLE" },
    });
    expect(result.ok ? "" : result.error.message).toContain("STORYRAIL_CREDENTIAL_KEY");
  });

  it("never carries the secret in a failure", async () => {
    const resolve = createResolveCredential({
      credentials: repositoryHolding(null),
      siteId: SITE,
      cipher: createAesGcmCredentialCipher({ key: KEY }),
    });

    expect(JSON.stringify(await resolve(OPENROUTER_API_KEY_SLOT))).not.toContain(SECRET);
  });
});
