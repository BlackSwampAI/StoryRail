import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./account-menu";
import { SCAFFOLD_SETTINGS } from "./account-scaffold";
import { ProfileWorkspace, SettingsWorkspace } from "./account-workspace";

describe("account scaffolding", () => {
  it("opens account navigation apart from the editorial desk", () => {
    const onOpenProfile = vi.fn();
    const onOpenSettings = vi.fn();
    render(<AccountMenu onOpenProfile={onOpenProfile} onOpenSettings={onOpenSettings} />);

    const trigger = screen.getByRole("button", { expanded: false });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Account" });

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Profile" }));
    expect(onOpenProfile).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("says plainly that sign-out does nothing yet", () => {
    render(<AccountMenu onOpenProfile={vi.fn()} onOpenSettings={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeDisabled();
    expect(screen.getByText(/StoryRail has no sign-in yet/)).toBeVisible();
  });

  it("marks the profile as scaffolding rather than stored account data", () => {
    render(<ProfileWorkspace />);

    expect(screen.getByRole("heading", { name: "Profile" })).toBeVisible();
    expect(screen.getByRole("note")).toHaveTextContent(/Nothing here is stored or editable/);
    expect(screen.getByText("Not implemented")).toBeVisible();
  });

  it("lays out every roadmap section with no working control", () => {
    render(<SettingsWorkspace />);

    for (const section of SCAFFOLD_SETTINGS) {
      expect(screen.getByRole("heading", { name: section.title })).toBeVisible();
    }
    // Scaffolding must not look operable: nothing here is wired to anything.
    for (const control of screen.getAllByRole("button")) {
      expect(control).toBeDisabled();
    }
  });
});
