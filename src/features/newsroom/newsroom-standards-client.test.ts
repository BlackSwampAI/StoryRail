// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";

import { createNewsroomStandardsClient } from "./newsroom-standards-client";

const SITE_ID = siteId("site-second");

const REVISION = {
  revisionNumber: 2,
  text: "Headlines are sentence case.",
  updatedAt: "2026-08-25T10:00:00.000Z",
};

const response = (status: number, value: unknown) =>
  new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });

describe("newsroom-standards-client", () => {
  it("asks for the standards of the Site it was built for", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, { ok: true, standards: [REVISION] }));

    const result = await createNewsroomStandardsClient({ siteId: SITE_ID, fetch }).listRevisions();

    expect(result).toEqual({ kind: "loaded", revisions: [REVISION] });
    expect(fetch).toHaveBeenCalledWith("/api/sites/site-second/newsroom-standards", {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  });

  it("saves a revision to the Site it was built for", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(201, { ok: true, standards: REVISION }));

    const result = await createNewsroomStandardsClient({ siteId: SITE_ID, fetch }).saveRevision(
      REVISION.text,
    );

    expect(result).toEqual({ kind: "saved", revision: REVISION });
    expect(fetch).toHaveBeenCalledWith("/api/sites/site-second/newsroom-standards", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: REVISION.text }),
    });
  });

  it("refuses a rejected revision rather than reporting it saved", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(422, {
        ok: false,
        error: { code: "NEWSROOM_STANDARDS_TEXT_INVALID", message: "The text is too long." },
      }),
    );

    const result = await createNewsroomStandardsClient({ siteId: SITE_ID, fetch }).saveRevision(
      "  ",
    );

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("refuses a history whose revisions are not shaped like revisions", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(response(200, { ok: true, standards: [{ revisionNumber: 1 }] }));

    const result = await createNewsroomStandardsClient({ siteId: SITE_ID, fetch }).listRevisions();

    expect(result).toEqual({ kind: "unavailable" });
  });

  it("reports the standards unavailable when the request never completes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));

    const client = createNewsroomStandardsClient({ siteId: SITE_ID, fetch });

    expect(await client.listRevisions()).toEqual({ kind: "unavailable" });
    expect(await client.saveRevision("Anything.")).toEqual({ kind: "unavailable" });
  });
});
