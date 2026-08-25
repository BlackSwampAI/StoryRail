import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_ID, resolveLandingSiteId } from "./site-configuration";

describe("resolveLandingSiteId", () => {
  it("lands an installation that never named a Site on the one it started with", () => {
    expect(resolveLandingSiteId({})).toBe(DEFAULT_SITE_ID);
    expect(resolveLandingSiteId({ STORYRAIL_SITE_ID: "   " })).toBe(DEFAULT_SITE_ID);
  });

  it("lands on the Site the operator named", () => {
    expect(resolveLandingSiteId({ STORYRAIL_SITE_ID: " site-second " })).toBe("site-second");
  });
});
