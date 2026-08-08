import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the newsroom application shell", () => {
    render(<HomePage />);

    expect(screen.getByText("StoryRail")).toBeVisible();
    expect(screen.getByText("Editorial control plane")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Story state queues" })).toBeVisible();
    expect(screen.getByRole("main")).toBeVisible();
  });
});
