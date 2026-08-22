import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./account-menu";
import { SCAFFOLD_SETTINGS } from "./account-scaffold";
import { NEWSROOM_THEMES } from "./theme";
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

  it("lets the operator choose a theme, the one setting that works", () => {
    const onThemeChange = vi.fn();
    render(<SettingsWorkspace theme="newsroom" onThemeChange={onThemeChange} />);

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(NEWSROOM_THEMES.length);
    expect(within(group).getByRole("radio", { name: /Newsroom/ })).toBeChecked();

    fireEvent.click(within(group).getByRole("radio", { name: /Newsprint/ }));
    expect(onThemeChange).toHaveBeenCalledWith("newsprint");
  });

  it("lays out every roadmap section with no working control", () => {
    render(<SettingsWorkspace theme="newsroom" onThemeChange={vi.fn()} />);

    for (const section of SCAFFOLD_SETTINGS) {
      expect(screen.getByRole("heading", { name: section.title })).toBeVisible();
    }
    // Scaffolding must not look operable, with one exception: choosing a theme really works.
    for (const control of screen.getAllByRole("button")) {
      expect(control).toBeDisabled();
    }
  });
});
