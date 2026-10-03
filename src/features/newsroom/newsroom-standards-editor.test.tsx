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
  brief: {
    audience: "Local residents",
    readerBenefit: "Understand public service changes.",
    coverageCriteria: "What changed and when.",
    voice: "Clear and calm.",
    avoid: "Speculation.",
  },
  updatedAt: "2026-08-25T10:00:00.000Z",
};

const json = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the newsroom standards editor", () => {
  it("revisits the saved guided brief and legacy standards for the selected Site", async () => {
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
      expect(screen.getByLabelText("Who do you write for?")).toHaveValue("Local residents"),
    );
    expect(screen.getByLabelText("What do you help them understand or do?")).toHaveValue(
      "Understand public service changes.",
    );
    expect(screen.getByRole("textbox", { name: /Additional editorial standards/ })).toHaveValue(
      "Headlines are sentence case.",
    );
    expect(fetch.mock.calls[0]?.[0]).toBe("/api/sites/site-second/newsroom-standards");
  });

  it("saves the guided answers and additional standards as one revision", async () => {
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

    fireEvent.change(screen.getByLabelText("Who do you write for?"), {
      target: { value: "Harbour district residents" },
    });
    fireEvent.change(screen.getByLabelText("What do you help them understand or do?"), {
      target: { value: "Know what changed and what to do next." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Additional editorial standards/ }), {
      target: { value: "Never write boasts." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save newsroom brief" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1]?.[0]).toBe("/api/sites/site-second/newsroom-standards");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      text: "Never write boasts.",
      brief: {
        audience: "Harbour district residents",
        readerBenefit: "Know what changed and what to do next.",
        coverageCriteria: "",
        voice: "",
        avoid: "",
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved newsroom brief as revision 1.",
    );
    expect(screen.getByRole("heading", { name: "Your publication summary" })).toBeVisible();
  });

  it("keeps the existing brief and style text when only one guided answer is changed", async () => {
    const updated = {
      ...REVISION,
      revisionNumber: 2,
      brief: { ...REVISION.brief, readerBenefit: "Know what changed and what to do next." },
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(200, { ok: true, standards: [REVISION] }))
      .mockResolvedValueOnce(json(201, { ok: true, standards: updated }));
    vi.stubGlobal("fetch", fetch);

    render(
      <NewsroomSiteProvider site={SECOND} sites={[SECOND]}>
        <NewsroomStandardsEditor />
      </NewsroomSiteProvider>,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("What do you help them understand or do?")).toHaveValue(
        "Understand public service changes.",
      ),
    );
    fireEvent.change(screen.getByLabelText("What do you help them understand or do?"), {
      target: { value: "Know what changed and what to do next." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save newsroom brief" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      text: "Headlines are sentence case.",
      brief: updated.brief,
    });
  });

  it("saves a structured-only brief while preserving empty additional standards", async () => {
    const briefOnly = { ...REVISION, text: "", revisionNumber: 1 };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(json(200, { ok: true, standards: [] }))
      .mockResolvedValueOnce(json(201, { ok: true, standards: briefOnly }));
    vi.stubGlobal("fetch", fetch);

    render(
      <NewsroomSiteProvider site={SECOND} sites={[SECOND]}>
        <NewsroomStandardsEditor />
      </NewsroomSiteProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Who do you write for?"), {
      target: { value: "Local residents" },
    });
    fireEvent.change(screen.getByLabelText("What do you help them understand or do?"), {
      target: { value: "Understand the local impact." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save newsroom brief" }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      text: "",
      brief: {
        audience: "Local residents",
        readerBenefit: "Understand the local impact.",
      },
    });
  });

  it("refuses to reach the newsroom at all when no Site is selected", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);

    render(<NewsroomStandardsEditor />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The newsroom brief could not be read. Try again.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
