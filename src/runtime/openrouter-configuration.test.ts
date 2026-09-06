import { describe, expect, it } from "vitest";

import {
  OpenRouterBaseUrlConfigurationError,
  resolveOpenRouterBaseUrl,
} from "./openrouter-configuration";

describe("OpenRouter base URL configuration", () => {
  it("is absent by default and normalizes a configured endpoint", () => {
    expect(resolveOpenRouterBaseUrl({})).toBeNull();
    expect(
      resolveOpenRouterBaseUrl({
        STORYRAIL_OPENROUTER_BASE_URL: "  http://127.0.0.1:3135/openrouter///  ",
      }),
    ).toBe("http://127.0.0.1:3135/openrouter");
  });

  it.each([
    "relative/path",
    "ftp://provider.test/api",
    "https://user:secret@provider.test/api",
    "https://provider.test/api?version=1",
    "https://provider.test/api#chat",
  ])("rejects invalid or credential-bearing endpoint %s without exposing it", (configured) => {
    expect(() => resolveOpenRouterBaseUrl({ STORYRAIL_OPENROUTER_BASE_URL: configured })).toThrow(
      OpenRouterBaseUrlConfigurationError,
    );
    try {
      resolveOpenRouterBaseUrl({ STORYRAIL_OPENROUTER_BASE_URL: configured });
    } catch (error) {
      expect(String(error)).not.toContain(configured);
    }
  });
});
