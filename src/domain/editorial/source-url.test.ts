import { describe, expect, it } from "vitest";

import { MAX_SUBMITTED_SOURCE_URL_LENGTH, canonicalizeSourceUrl } from "./index";

function expectCanonical(submittedUrl: string, expected: string): void {
  const result = canonicalizeSourceUrl(submittedUrl);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.canonicalUrl).toBe(expected);
  }
}

describe("canonicalizeSourceUrl", () => {
  it.each([
    ["http://example.com/report", "http://example.com/report"],
    ["https://example.com/report", "https://example.com/report"],
  ])("accepts an absolute URL using %s", (submittedUrl, expected) => {
    expectCanonical(submittedUrl, expected);
  });

  it("trims surrounding whitespace for parsing", () => {
    expectCanonical(" \n\thttps://example.com/report\t ", "https://example.com/report");
  });

  it.each([
    ["HTTPS://EXAMPLE.COM/News", "https://example.com/News"],
    ["http://EXAMPLE.COM/News", "http://example.com/News"],
  ])("normalizes protocol and hostname casing for %s", (submittedUrl, expected) => {
    expectCanonical(submittedUrl, expected);
  });

  it.each([
    ["http://example.com:80/report", "http://example.com/report"],
    ["https://example.com:443/report", "https://example.com/report"],
  ])("removes a default port from %s", (submittedUrl, expected) => {
    expectCanonical(submittedUrl, expected);
  });

  it("preserves a non-default port", () => {
    expectCanonical("https://example.com:8443/report", "https://example.com:8443/report");
  });

  it("removes a fragment", () => {
    expectCanonical(
      "https://example.com/report?edition=us#results",
      "https://example.com/report?edition=us",
    );
  });

  it.each([
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "mc_cid",
    "mc_eid",
  ])("removes the documented %s tracking parameter family", (parameterName) => {
    expectCanonical(
      `https://example.com/report?keep=first&${parameterName}=tracking&keep=second`,
      "https://example.com/report?keep=first&keep=second",
    );
  });

  it.each(["UTM_SOURCE", "FbClId", "GCLID", "DClId", "MSCLKID", "MC_CID", "Mc_EiD"])(
    "removes %s case-insensitively",
    (parameterName) => {
      expectCanonical(
        `https://example.com/report?${parameterName}=tracking&edition=us`,
        "https://example.com/report?edition=us",
      );
    },
  );

  it("preserves functional parameters, values, repetitions, and relative ordering", () => {
    expectCanonical(
      "https://example.com/report?topic=MCU&tag=first&utm_source=feed&tag=second&page=2",
      "https://example.com/report?topic=MCU&tag=first&tag=second&page=2",
    );
  });

  it("preserves unknown query parameters", () => {
    expectCanonical(
      "https://example.com/report?campaign_id=internal&ref=homepage",
      "https://example.com/report?campaign_id=internal&ref=homepage",
    );
  });

  it("removes an empty query delimiter after removing tracking parameters", () => {
    expectCanonical("https://example.com/report?utm_source=feed", "https://example.com/report");
  });

  it("normalizes an internationalized hostname through the platform URL implementation", () => {
    expectCanonical("https://b\u00fccher.example/Neu", "https://xn--bcher-kva.example/Neu");
  });

  it.each(["", "   ", "\n\t"])(
    "rejects required input %# with SOURCE_URL_REQUIRED",
    (submittedUrl) => {
      const result = canonicalizeSourceUrl(submittedUrl);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "SOURCE_URL_REQUIRED" },
      });
    },
  );

  it("accepts a submitted URL exactly 2,048 characters long", () => {
    const submittedUrl = `https://example.com/${"a".repeat(2_028)}`;

    expect(submittedUrl).toHaveLength(MAX_SUBMITTED_SOURCE_URL_LENGTH);
    expect(canonicalizeSourceUrl(submittedUrl).ok).toBe(true);
  });

  it("rejects a submitted URL over 2,048 characters long", () => {
    const submittedUrl = `https://example.com/${"a".repeat(2_029)}`;
    const result = canonicalizeSourceUrl(submittedUrl);

    expect(submittedUrl).toHaveLength(MAX_SUBMITTED_SOURCE_URL_LENGTH + 1);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "SOURCE_URL_TOO_LONG",
        message: "A submitted Source URL cannot exceed 2048 characters.",
        maximumLength: MAX_SUBMITTED_SOURCE_URL_LENGTH,
      },
    });
  });

  it.each(["not a URL", "/relative/report", "example.com/report", "https://exa mple.com"])(
    "rejects malformed or relative input %#",
    (submittedUrl) => {
      const result = canonicalizeSourceUrl(submittedUrl);

      expect(result).toMatchObject({
        ok: false,
        error: { code: "INVALID_SOURCE_URL" },
      });
    },
  );

  it.each([
    "ftp://example.com/report",
    "file:///tmp/report",
    "mailto:desk@example.com",
    "data:text/plain,report",
    "javascript:alert(1)",
  ])("rejects unsupported protocol input %# with a stable error", (submittedUrl) => {
    const result = canonicalizeSourceUrl(submittedUrl);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_SOURCE_PROTOCOL" },
    });
  });

  it.each([
    "https://reporter@example.com/report",
    "https://:secret@example.com/report",
    "https://reporter:secret@example.com/report",
  ])("rejects embedded credentials in %#", (submittedUrl) => {
    const result = canonicalizeSourceUrl(submittedUrl);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SOURCE_URL_CREDENTIALS_NOT_ALLOWED" },
    });
  });

  it("does not echo credentials, query material, or the submitted URL in validation errors", () => {
    const submittedUrl = "https://reporter:very-secret@example.com/report?token=sensitive";
    const result = canonicalizeSourceUrl(submittedUrl);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).not.toContain(submittedUrl);
      expect(result.error.message).not.toContain("reporter");
      expect(result.error.message).not.toContain("very-secret");
      expect(result.error.message).not.toContain("token=sensitive");
    }
  });
});
