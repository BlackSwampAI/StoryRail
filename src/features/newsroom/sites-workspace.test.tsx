import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";

import type { SiteClient } from "./site-client";
import { SitesWorkspace } from "./sites-workspace";

const CURRENT: Site = {
  id: siteId("site-default"),
  name: "Default Newsroom",
  domain: "localhost",
  description: "The newsroom this installation started with.",
};

function client(overrides: Partial<SiteClient> = {}): SiteClient {
  return {
    listSites: vi.fn(async () => ({ kind: "completed" as const, value: [CURRENT] })),
    createSite: vi.fn(async () => ({
      kind: "completed" as const,
      value: {
        id: siteId("site-second"),
        name: "Second Newsroom",
        domain: "second.example",
        description: "A second newsroom.",
      },
    })),
    ...overrides,
  };
}

function fillCreationForm(domain: string) {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Second Newsroom" } });
  fireEvent.change(screen.getByLabelText("Domain"), { target: { value: domain } });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "A second newsroom." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Site" }));
}

describe("the Sites workspace", () => {
  it("names the Site the operator is looking at among the others", () => {
    render(<SitesWorkspace sites={[CURRENT]} currentSiteId={CURRENT.id} requests={client()} />);

    expect(screen.getByRole("heading", { name: "Default Newsroom" })).toBeVisible();
    expect(screen.getByText("Current")).toBeVisible();
  });

  it("corrects the hostname before submitting it rather than passing a rejection back", async () => {
    const requests = client();
    render(<SitesWorkspace sites={[CURRENT]} currentSiteId={CURRENT.id} requests={requests} />);

    fillCreationForm("  Second.Example.  ");

    expect(requests.createSite).toHaveBeenCalledWith({
      name: "Second Newsroom",
      domain: "second.example",
      description: "A second newsroom.",
    });
  });

  it("refuses a domain that is not a hostname without asking the server", async () => {
    const requests = client();
    render(<SitesWorkspace sites={[CURRENT]} currentSiteId={CURRENT.id} requests={requests} />);

    fillCreationForm("https://second.example/newsroom");

    expect(requests.createSite).not.toHaveBeenCalled();
    expect(await screen.findByRole("status")).toHaveTextContent("hostname");
  });

  it("reads a domain another Site already publishes back as words", async () => {
    const requests = client({
      createSite: vi.fn(async () => ({
        kind: "application-failure" as const,
        error: {
          code: "SITE_DOMAIN_TAKEN",
          message: "Another Site already publishes second.example.",
        },
      })),
    });
    render(<SitesWorkspace sites={[CURRENT]} currentSiteId={CURRENT.id} requests={requests} />);

    fillCreationForm("second.example");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Another Site already publishes second.example.",
    );
  });

  it("offers the new Site once it exists", async () => {
    const onSiteCreated = vi.fn();
    render(
      <SitesWorkspace
        sites={[CURRENT]}
        currentSiteId={CURRENT.id}
        requests={client()}
        onSiteCreated={onSiteCreated}
      />,
    );

    fillCreationForm("second.example");

    expect(await screen.findByRole("link", { name: "Open Second Newsroom" })).toHaveAttribute(
      "href",
      "/s/site-second",
    );
    expect(onSiteCreated).toHaveBeenCalledWith(expect.objectContaining({ id: "site-second" }));
  });
});
