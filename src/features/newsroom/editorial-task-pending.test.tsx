import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EditorialTaskPending } from "./editorial-task-pending";

describe("EditorialTaskPending", () => {
  it("exposes a visible, labelled, busy status surface", () => {
    render(
      <EditorialTaskPending
        label="Current task · Writer revision"
        headline="Writer is revising the Article…"
        subtitle="Applying the operator decision against exact evidence."
        headingId="writer-revision-pending"
      />,
    );

    const status = screen.getByRole("status", { name: "Writer is revising the Article…" });
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Current task · Writer revision")).toBeVisible();
    expect(
      screen.getByText("Applying the operator decision against exact evidence."),
    ).toBeVisible();
  });
});
