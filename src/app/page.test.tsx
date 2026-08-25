// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));

describe("the newsroom landing page", () => {
  it("sends a bookmark of the bare root to the Site this installation lands on", async () => {
    const { default: HomePage } = await import("@/app/page");

    HomePage();

    expect(redirect).toHaveBeenCalledWith("/s/site-default");
  });
});
