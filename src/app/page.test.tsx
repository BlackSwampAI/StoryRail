import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("renders the newsroom application shell", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = String(input);
      if (path === "/api/stories") {
        return new Response(JSON.stringify({ ok: true, stories: [] }), { status: 200 });
      }
      if (path === "/api/source-inbox") {
        return new Response(JSON.stringify({ ok: true, sources: [] }), { status: 200 });
      }
      throw new Error(`Unexpected HomePage request: ${path}`);
    });
    vi.stubGlobal("fetch", fetch);
    render(<HomePage />);

    expect(screen.getByText("StoryRail")).toBeVisible();
    expect(screen.getByText("Editorial control plane")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Newsroom navigation" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Intake, 0 stories" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("/api/stories", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    expect(fetch).toHaveBeenCalledWith("/api/source-inbox", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });
});
