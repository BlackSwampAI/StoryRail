import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HomePage", () => {
  it("renders the newsroom application shell", async () => {
    const fetch = vi.fn(
      async () => new Response(JSON.stringify({ ok: true, stories: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    render(<HomePage />);

    expect(screen.getByText("StoryRail")).toBeVisible();
    expect(screen.getByText("Editorial control plane")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Story state queues" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Intake, 0 stories" })).toBeVisible();
    expect(fetch).toHaveBeenCalledOnce();
  });
});
