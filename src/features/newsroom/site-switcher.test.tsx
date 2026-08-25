import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";

import { SiteSwitcher } from "./site-switcher";

const FIRST: Site = {
  id: siteId("site-default"),
  name: "Default Newsroom",
  domain: "localhost",
  description: "The newsroom this installation started with.",
};

const SECOND: Site = {
  id: siteId("site-second"),
  name: "Second Newsroom",
  domain: "second.example",
  description: "A second newsroom.",
};

describe("the Site switcher", () => {
  it("names the newsroom the operator is looking at", () => {
    render(<SiteSwitcher site={FIRST} sites={[FIRST, SECOND]} onCreateSite={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Current Site, Default Newsroom" })).toBeVisible();
  });

  it("moves to another Site by its own address, so a tab and a link both carry it", () => {
    render(<SiteSwitcher site={FIRST} sites={[FIRST, SECOND]} onCreateSite={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Current Site, Default Newsroom" }));

    expect(screen.getByRole("menuitem", { name: /Second Newsroom/ })).toHaveAttribute(
      "href",
      "/s/site-second",
    );
  });

  it("puts creating a Site in plain sight while there is only one", () => {
    const onCreateSite = vi.fn();
    render(<SiteSwitcher site={FIRST} sites={[FIRST]} onCreateSite={onCreateSite} />);

    fireEvent.click(screen.getByRole("button", { name: "Create a Site" }));

    expect(onCreateSite).toHaveBeenCalledOnce();
  });

  it("puts creating a Site back in the menu once there are several", () => {
    render(<SiteSwitcher site={FIRST} sites={[FIRST, SECOND]} onCreateSite={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Create a Site" })).toBeNull();
  });
});
