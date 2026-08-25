import { describe, expect, it } from "vitest";

import { MAX_SITE_DOMAIN_LENGTH, canonicalizeSiteDomain } from "./site-domain";

describe("canonicalizeSiteDomain", () => {
  it("accepts the hostname an operator typed on their letterhead", () => {
    expect(canonicalizeSiteDomain("  Example.COM ")).toEqual({ ok: true, domain: "example.com" });
    expect(canonicalizeSiteDomain("news.example.co.uk.")).toEqual({
      ok: true,
      domain: "news.example.co.uk",
    });
    expect(canonicalizeSiteDomain("localhost")).toEqual({ ok: true, domain: "localhost" });
  });

  it("refuses a domain that is only whitespace", () => {
    expect(canonicalizeSiteDomain("   ")).toEqual({
      ok: false,
      error: { code: "SITE_DOMAIN_REQUIRED", message: expect.any(String) },
    });
  });

  it("refuses a domain longer than a hostname may be", () => {
    const result = canonicalizeSiteDomain(`${"a".repeat(MAX_SITE_DOMAIN_LENGTH + 1)}.com`);
    expect(result).toEqual({
      ok: false,
      error: { code: "SITE_DOMAIN_TOO_LONG", message: expect.any(String) },
    });
  });

  it.each([
    "https://example.com",
    "example.com/newsroom",
    "example .com",
    "example..com",
    "-example.com",
    "example.com:8080",
    "exa_mple.com",
  ])("refuses %s, which is not a bare hostname", (submitted) => {
    expect(canonicalizeSiteDomain(submitted)).toEqual({
      ok: false,
      error: { code: "INVALID_SITE_DOMAIN", message: expect.any(String) },
    });
  });
});
