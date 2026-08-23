// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { createAesGcmCredentialCipher } from "@/adapters/credential-cipher";
import { FIRECRAWL_API_KEY_SLOT, OPENROUTER_API_KEY_SLOT, siteId } from "@/domain/editorial";

import { DEFAULT_SITE_MODEL_IDS, createSiteStore } from "./site-store";

const SITE = siteId("site-default");
const OTHER_SITE = siteId("site-other");
const KEY = Buffer.alloc(32, 4).toString("base64");
const SECRET = "sk-or-v1-stored-in-postgres-7f3a";

function poolAnswering(rowsFor: (sql: string, values: readonly unknown[]) => unknown[]) {
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    const rows = rowsFor(sql, values);
    return { rows, rowCount: rows.length };
  });
  return { pool: { query } as unknown as Pool, query };
}

function storedRow(site: string, slot: string, secret = SECRET) {
  const credential = createAesGcmCredentialCipher({ key: KEY }).encrypt(secret, {
    siteId: siteId(site),
    slot: slot as typeof OPENROUTER_API_KEY_SLOT,
  });
  return {
    ciphertext: Buffer.from(credential.ciphertext),
    nonce: Buffer.from(credential.nonce),
    auth_tag: Buffer.from(credential.authTag),
    key_version: credential.keyVersion,
    hint: credential.hint,
  };
}

describe("the per-Site store a runtime resolves against", () => {
  it("reads the key from the database every time it is asked", async () => {
    const { pool, query } = poolAnswering((sql) =>
      sql.includes("site_credentials") ? [storedRow("site-default", OPENROUTER_API_KEY_SLOT)] : [],
    );
    const store = createSiteStore({ pool, siteId: SITE, credentialKey: KEY });

    await expect(store.resolveApiKey(OPENROUTER_API_KEY_SLOT)).resolves.toEqual({
      ok: true,
      apiKey: SECRET,
    });
    await expect(store.resolveApiKey(OPENROUTER_API_KEY_SLOT)).resolves.toEqual({
      ok: true,
      apiKey: SECRET,
    });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("touches the database only when a credential is actually needed", () => {
    const { pool, query } = poolAnswering(() => []);

    createSiteStore({ pool, siteId: SITE, credentialKey: KEY });

    expect(query).not.toHaveBeenCalled();
  });

  it("scopes every lookup to its own Site", async () => {
    const { pool, query } = poolAnswering(() => []);
    const store = createSiteStore({ pool, siteId: OTHER_SITE, credentialKey: KEY });

    await expect(store.resolveApiKey(FIRECRAWL_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: { code: "FIRECRAWL_API_KEY_REQUIRED", slot: FIRECRAWL_API_KEY_SLOT },
    });
    expect(query.mock.calls[0]?.[1]).toEqual([OTHER_SITE, FIRECRAWL_API_KEY_SLOT]);
  });

  it("refuses another Site's credential rather than reading it as its own", async () => {
    // The row is real and the key is right; only the Site it was encrypted for differs, which is
    // the case a query filter alone would not catch if one were ever written wrongly.
    const { pool } = poolAnswering((sql) =>
      sql.includes("site_credentials") ? [storedRow("site-other", OPENROUTER_API_KEY_SLOT)] : [],
    );
    const store = createSiteStore({ pool, siteId: SITE, credentialKey: KEY });

    await expect(store.resolveApiKey(OPENROUTER_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE", slot: OPENROUTER_API_KEY_SLOT },
    });
  });

  it("names the OpenRouter key as required when a newsroom has entered none", async () => {
    const { pool } = poolAnswering(() => []);
    const store = createSiteStore({ pool, siteId: SITE, credentialKey: KEY });

    await expect(store.resolveApiKey(OPENROUTER_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: {
        code: "OPENROUTER_API_KEY_REQUIRED",
        reason: "CREDENTIAL_NOT_CONFIGURED",
        slot: OPENROUTER_API_KEY_SLOT,
      },
    });
  });

  it("names the missing encryption key apart from a missing credential", async () => {
    const { pool } = poolAnswering((sql) =>
      sql.includes("site_credentials") ? [storedRow("site-default", OPENROUTER_API_KEY_SLOT)] : [],
    );
    const store = createSiteStore({ pool, siteId: SITE, credentialKey: null });

    await expect(store.resolveApiKey(OPENROUTER_API_KEY_SLOT)).resolves.toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_KEY_UNAVAILABLE", reason: "CREDENTIAL_KEY_UNAVAILABLE" },
    });
  });

  it("runs a newsroom that has chosen no models on the ones the installation shipped with", async () => {
    const { pool } = poolAnswering(() => []);

    await expect(
      createSiteStore({ pool, siteId: SITE, credentialKey: KEY }).readModelIds(),
    ).resolves.toEqual(DEFAULT_SITE_MODEL_IDS);
  });

  it("prefers the models a newsroom chose over the installation defaults", async () => {
    const models = {
      evidencePreparation: "chosen/one",
      assignmentEditor: "chosen/two",
      writer: "chosen/three",
      director: "chosen/four",
      researcher: "chosen/five",
    };
    const { pool } = poolAnswering((sql) =>
      sql.includes("site_settings") ? [{ payload: { models } }] : [],
    );

    await expect(
      createSiteStore({ pool, siteId: SITE, credentialKey: KEY }).readModelIds(),
    ).resolves.toEqual(models);
  });
});
