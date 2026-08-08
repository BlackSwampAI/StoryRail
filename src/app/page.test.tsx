import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "@/app/page";

describe("HomePage", () => {
  it("identifies StoryRail and its pre-alpha editorial purpose", () => {
    render(<HomePage />);

    expect(screen.getByRole("heading", { name: "StoryRail" })).toBeVisible();
    expect(screen.getByText("Editorial control plane")).toBeVisible();
    expect(screen.getByText(/visible agentic editorial workflow/i)).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(/pre-alpha/i);
  });
});
