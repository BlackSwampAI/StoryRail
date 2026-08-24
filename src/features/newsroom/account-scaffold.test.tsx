import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountMenu } from "./account-menu";
import { SCAFFOLD_SETTINGS } from "./account-scaffold";
import { NEWSROOM_THEMES } from "./theme";
import { ProfileWorkspace, SettingsWorkspace } from "./account-workspace";
import type { ModelCatalogClient } from "./model-catalog-client";
import type { SiteSettingsClient } from "./site-settings-client";

// The scaffolding is what is on screen while nothing has been read, so these tests never resolve.
const inertClient: SiteSettingsClient = {
  readSettings: () => new Promise(() => {}),
  saveModels: () => new Promise(() => {}),
  setCredential: () => new Promise(() => {}),
  removeCredential: () => new Promise(() => {}),
};

const inertCatalog: ModelCatalogClient = { readCatalog: () => new Promise(() => {}) };

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
    render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={onThemeChange}
        requests={inertClient}
        catalog={inertCatalog}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Theme" });
    const options = within(group).getAllByRole("radio");
    expect(options).toHaveLength(NEWSROOM_THEMES.length);
    expect(within(group).getByRole("radio", { name: /Newsroom/ })).toBeChecked();

    fireEvent.click(within(group).getByRole("radio", { name: /Newsprint/ }));
    expect(onThemeChange).toHaveBeenCalledWith("newsprint");
  });

  it("lays out every roadmap section and leaves each unbacked connector inert", () => {
    render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={inertClient}
        catalog={inertCatalog}
      />,
    );

    for (const section of SCAFFOLD_SETTINGS) {
      expect(screen.getByRole("heading", { name: section.title })).toBeVisible();
    }
    // A connector with no adapter behind it must not look operable. Only the stored connectors
    // and the theme picker do anything, and neither offers a Connect button.
    for (const control of screen.getAllByRole("button", { name: /^(Connect|Manage)$/ })) {
      expect(control).toBeDisabled();
    }
  });

  it("says in its notice which settings are stored and which are still layout", () => {
    render(
      <SettingsWorkspace
        theme="newsroom"
        onThemeChange={vi.fn()}
        requests={inertClient}
        catalog={inertCatalog}
      />,
    );

    const notice = screen.getAllByRole("note")[0];
    expect(notice).toHaveTextContent(/OpenRouter key/);
    expect(notice).toHaveTextContent(/Every other row is layout/);
    expect(notice).not.toHaveTextContent(/None of these controls do anything yet/);
  });
});
