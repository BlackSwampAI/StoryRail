import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";

import { NewsroomSiteProvider } from "./newsroom-clients";
import { NewsroomStandardsEditor } from "./newsroom-standards-editor";

const SECOND: Site = {
  id: siteId("site-second"),
  name: "site-second",
  domain: "second.example",
  description: "The site-second newsroom.",
};

const REVISION = {
  revisionNumber: 1,
  text: "Headlines are sentence case.",
  updatedAt: "2026-08-25T10:00:00.000Z",
};

const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the newsroom standards editor", () => {
  it("reads the standards of the Site being looked at", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(json(200, { ok: true, standards: [REVISION] }));
    vi.stubGlobal("fetch", fetch);

    render(
      <NewsroomSiteProvider site={SECOND} sites={[SECOND]}>
        <NewsroomStandardsEditor />
      </NewsroomSiteProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText("Standards")).toHaveValue("Headlines are sentence case."),
    );
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/sites/site-second/newsroom-standards");
  });

  it("saves a revision to the Site being looked at", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(200, { ok: true, standards: [] }))
      .mockResolvedValueOnce(json(201, { ok: true, standards: REVISION }));
    vi.stubGlobal("fetch", fetch);

    render(
      <NewsroomSiteProvider site={SECOND} sites={[SECOND]}>
        <NewsroomStandardsEditor />
      </NewsroomSiteProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Standards"), {
      target: { value: "Never write boasts." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save revision" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/sites/site-second/newsroom-standards");
    expect(await screen.findByRole("status")).toHaveTextContent("Saved as revision 1.");
  });

  it("refuses to reach the newsroom at all when no Site is selected", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    render(<NewsroomStandardsEditor />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The newsroom standards could not be read.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
