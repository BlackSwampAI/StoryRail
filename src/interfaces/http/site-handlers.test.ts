// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { siteId, type Site } from "@/domain/editorial";
import type { SiteDirectoryRuntime } from "@/runtime";

import { createCreateSiteHttpHandler, createListSitesHttpHandler } from "./site-handlers";

const SITE: Site = {
  id: siteId("site-second"),
  name: "Second Newsroom",
  domain: "second.example",
  description: "A second newsroom.",
};

function directory(overrides: Partial<SiteDirectoryRuntime> = {}): SiteDirectoryRuntime {
  return Object.freeze({
    findSite: vi.fn(async () => null),
    listSites: vi.fn(async () => [SITE]),
    createSite: vi.fn(async () => ({ ok: true, site: SITE })),
    close: vi.fn(async () => undefined),
    ...overrides,
  }) as unknown as SiteDirectoryRuntime;
}

function creationRequest(body: unknown): Request {
  return new Request("http://storyrail.test/api/sites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("the Sites HTTP handlers", () => {
  it("lists the Sites this installation has", async () => {
    const handler = createListSitesHttpHandler({ getDirectory: () => directory() });

    const response = await handler();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, sites: [SITE] });
  });

  it("creates a Site and lets the process remember it", async () => {
    const onSiteCreated = vi.fn();
    const handler = createCreateSiteHttpHandler({
      getDirectory: () => directory(),
      onSiteCreated,
    });

    const response = await handler(
      creationRequest({
        name: SITE.name,
        domain: SITE.domain,
        description: SITE.description,
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, site: SITE });
    expect(onSiteCreated).toHaveBeenCalledWith(SITE.id);
  });

  it("answers a domain another Site already publishes with its own code, not a server failure", async () => {
    const handler = createCreateSiteHttpHandler({
      getDirectory: () =>
        directory({
          createSite: vi.fn(async () => ({
            ok: false as const,
            error: {
              code: "SITE_DOMAIN_TAKEN" as const,
              message: "Another Site already publishes second.example.",
              domain: "second.example",
            },
          })),
        }),
    });

    const response = await handler(
      creationRequest({ name: "Second", domain: "second.example", description: "Second." }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "SITE_DOMAIN_TAKEN" },
    });
  });

  it("answers a domain that is not a hostname with the domain's own refusal", async () => {
    const handler = createCreateSiteHttpHandler({
      getDirectory: () =>
        directory({
          createSite: vi.fn(async () => ({
            ok: false as const,
            error: { code: "INVALID_SITE_DOMAIN" as const, message: "not a hostname" },
          })),
        }),
    });

    const response = await handler(
      creationRequest({ name: "Second", domain: "https://x", description: "Second." }),
    );

    expect(response.status).toBe(422);
  });

  it("refuses a body that is not exactly a Site description", async () => {
    const createSite = vi.fn();
    const handler = createCreateSiteHttpHandler({ getDirectory: () => directory({ createSite }) });

    const response = await handler(creationRequest({ name: "Second" }));

    expect(response.status).toBe(400);
    expect(createSite).not.toHaveBeenCalled();
  });

  it("refuses a request that is not JSON", async () => {
    const createSite = vi.fn();
    const handler = createCreateSiteHttpHandler({ getDirectory: () => directory({ createSite }) });

    const response = await handler(
      new Request("http://storyrail.test/api/sites", { method: "POST", body: "name=second" }),
    );

    expect(response.status).toBe(415);
    expect(createSite).not.toHaveBeenCalled();
  });
});
