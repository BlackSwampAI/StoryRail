import { describe, expect, it } from "vitest";

import { siteId } from "@/domain/editorial";

import { siteApiPath, sitePagePath } from "./site-paths";

describe("newsroom paths", () => {
  it("names the Site in every request the browser makes", () => {
    expect(siteApiPath(siteId("site-second"), "/stories")).toBe("/api/sites/site-second/stories");
    expect(sitePagePath(siteId("site-second"))).toBe("/s/site-second");
  });

  it("escapes an identifier so it cannot reach a path it was not given", () => {
    expect(siteApiPath(siteId("site/../other"), "/stories")).toBe(
      "/api/sites/site%2F..%2Fother/stories",
    );
  });
});
