import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_ID, resolveSiteId } from "./site-configuration";

describe("resolveSiteId", () => {
  it("keeps an installation that never named a Site on the one it started with", () => {
    expect(resolveSiteId({})).toBe(DEFAULT_SITE_ID);
    expect(resolveSiteId({ STORYRAIL_SITE_ID: "   " })).toBe(DEFAULT_SITE_ID);
  });

  it("serves the Site the operator named", () => {
    expect(resolveSiteId({ STORYRAIL_SITE_ID: " site-second " })).toBe("site-second");
  });
});
