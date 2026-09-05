import { describe, expect, it } from "vitest";

import { siteDestinationInstanceId, type SiteDestinationSettings } from ".";

describe("identifying a configured destination installation", () => {
  const wordpress: Extract<SiteDestinationSettings, { kind: "wordpress" }> = {
    kind: "wordpress",
    baseUrl: "https://newsroom.test",
    username: "editor",
    draft: true,
  };

  it("does not change identity when credentials-adjacent settings or draft policy change", () => {
    expect(siteDestinationInstanceId({ ...wordpress, username: "publisher", draft: false })).toBe(
      siteDestinationInstanceId(wordpress),
    );
    expect(siteDestinationInstanceId({ ...wordpress, baseUrl: "https://newsroom.test/" })).toBe(
      siteDestinationInstanceId(wordpress),
    );
  });

  it("changes identity when the installation URL or connector kind changes", () => {
    expect(siteDestinationInstanceId({ ...wordpress, baseUrl: "https://other.test" })).not.toBe(
      siteDestinationInstanceId(wordpress),
    );
    expect(
      siteDestinationInstanceId({
        kind: "studiocms",
        baseUrl: wordpress.baseUrl,
        package: "studiocms/markdown",
        draft: wordpress.draft,
      }),
    ).not.toBe(siteDestinationInstanceId(wordpress));
  });
});
