import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";

import { NewsroomSiteProvider, useNewsroomClients } from "./newsroom-clients";

function site(id: string, domain: string): Site {
  return { id: siteId(id), name: id, domain, description: `The ${id} newsroom.` };
}

function ListStories({ onResult }: { readonly onResult?: (value: unknown) => void }) {
  const clients = useNewsroomClients();
  useEffect(() => {
    void clients.stories.listStories().then((result) => onResult?.(result));
  }, [clients, onResult]);
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the newsroom clients", () => {
  it("asks for the Stories of the Site being looked at", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(JSON.stringify({ ok: true, stories: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetch);
    const second = site("site-second", "second.example");

    render(
      <NewsroomSiteProvider site={second} sites={[second]}>
        <ListStories />
      </NewsroomSiteProvider>,
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/sites/site-second/stories", {
        method: "GET",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("fails rather than guessing a tenant when it is rendered outside a Site", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    const onResult = vi.fn();

    render(<ListStories onResult={onResult} />);

    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ kind: "unavailable" })),
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
