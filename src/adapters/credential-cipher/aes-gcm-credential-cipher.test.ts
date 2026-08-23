// @vitest-environment node

import { describe, expect, it } from "vitest";

import { siteId, type CredentialSlot, type EncryptedCredential } from "@/domain/editorial";

import {
  CredentialCipherKeyError,
  createAesGcmCredentialCipher,
} from "./aes-gcm-credential-cipher";

const KEY = Buffer.alloc(32, 3).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 9).toString("base64");
const SLOT = "openrouter_api_key" as CredentialSlot;
const MINE = { siteId: siteId("site-default"), slot: SLOT };
const THEIRS = { siteId: siteId("site-other"), slot: SLOT };
const SECRET = "sk-or-v1-0123456789abcdef";

function tamper(credential: EncryptedCredential, field: "ciphertext" | "authTag") {
  const copy = Uint8Array.from(credential[field]);
  copy[0] = (copy[0] ?? 0) ^ 0xff;
  return { ...credential, [field]: copy };
}

describe("the AES-GCM credential cipher", () => {
  it("returns a secret unchanged after a round trip", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    expect(cipher.decrypt(cipher.encrypt(SECRET, MINE), MINE)).toEqual({
      ok: true,
      secret: SECRET,
    });
  });

  it("produces a different ciphertext each time it encrypts the same secret", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    const first = cipher.encrypt(SECRET, MINE);
    const second = cipher.encrypt(SECRET, MINE);

    expect(Buffer.from(first.nonce).equals(Buffer.from(second.nonce))).toBe(false);
    expect(Buffer.from(first.ciphertext).equals(Buffer.from(second.ciphertext))).toBe(false);
  });

  it("refuses a credential encrypted for another Site", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    const lifted = cipher.encrypt(SECRET, MINE);

    expect(cipher.decrypt(lifted, THEIRS)).toEqual({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE" },
    });
  });

  it("refuses a credential moved into a different slot on the same Site", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    const lifted = cipher.encrypt(SECRET, MINE);

    expect(
      cipher.decrypt(lifted, { siteId: MINE.siteId, slot: "firecrawl_api_key" as CredentialSlot }),
    ).toMatchObject({ ok: false });
  });

  it("refuses a tampered ciphertext", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    expect(cipher.decrypt(tamper(cipher.encrypt(SECRET, MINE), "ciphertext"), MINE)).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE" },
    });
  });

  it("refuses a tampered authentication tag", () => {
    const cipher = createAesGcmCredentialCipher({ key: KEY });

    expect(cipher.decrypt(tamper(cipher.encrypt(SECRET, MINE), "authTag"), MINE)).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_UNREADABLE" },
    });
  });

  it("says only that a credential is unreadable, never which way it failed", () => {
    const stored = createAesGcmCredentialCipher({ key: KEY }).encrypt(SECRET, MINE);
    const wrongKey = createAesGcmCredentialCipher({ key: OTHER_KEY });

    const outcomes = [
      wrongKey.decrypt(stored, MINE),
      wrongKey.decrypt(stored, THEIRS),
      createAesGcmCredentialCipher({ key: KEY }).decrypt(tamper(stored, "ciphertext"), MINE),
    ];

    expect(outcomes).toEqual([
      { ok: false, error: { code: "CREDENTIAL_UNREADABLE" } },
      { ok: false, error: { code: "CREDENTIAL_UNREADABLE" } },
      { ok: false, error: { code: "CREDENTIAL_UNREADABLE" } },
    ]);
  });

  it.each([
    ["too short", Buffer.alloc(16, 1).toString("base64")],
    ["too long", Buffer.alloc(64, 1).toString("base64")],
    ["not base64", "this is not base64!"],
    ["empty", ""],
  ])("rejects a key that is %s before anything can be encrypted with it", (_reason, key) => {
    expect(() => createAesGcmCredentialCipher({ key })).toThrow(CredentialCipherKeyError);
  });

  it("stores a hint of the last four characters and nothing more of the secret", () => {
    const credential = createAesGcmCredentialCipher({ key: KEY }).encrypt(SECRET, MINE);

    expect(credential.hint).toBe("cdef");
    expect(Buffer.from(credential.ciphertext).toString("utf8")).not.toContain(SECRET);
    expect(JSON.stringify(credential)).not.toContain(SECRET.slice(0, 8));
  });

  it("gives no hint at all for a secret short enough to be guessed from one", () => {
    expect(createAesGcmCredentialCipher({ key: KEY }).encrypt("short", MINE).hint).toBe("");
  });
});
