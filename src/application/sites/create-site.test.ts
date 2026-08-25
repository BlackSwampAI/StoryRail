import { describe, expect, it, vi } from "vitest";

import { BUILT_IN_AGENT_PROFILE_TEMPLATES, type Site } from "@/domain/editorial";

import { createCreateSite } from "./create-site";
import type { CreateSiteResult, SiteRepository } from "./site-repository";

function repository(result?: CreateSiteResult) {
  const create = vi.fn<SiteRepository["create"]>(
    async (site: Site): Promise<CreateSiteResult> => result ?? { ok: true, site },
  );
  return {
    repository: { findById: vi.fn(), list: vi.fn(), create } as unknown as SiteRepository,
    create,
  };
}

function identifiers() {
  let next = 0;
  return () => {
    next += 1;
    return `identifier-${next}`;
  };
}

describe("createSite", () => {
  it("staffs a new Site with the four built-in Agent Profiles", async () => {
    const { repository: sites, create } = repository();
    const workflow = createCreateSite({ sites, createUuid: identifiers() });

    const result = await workflow({
      name: "Second Newsroom",
      domain: "second.example",
      description: "A second newsroom.",
    });

    expect(result.ok).toBe(true);
    const profiles = create.mock.calls[0]?.[1] ?? [];
    expect(profiles.map((profile) => profile.role)).toEqual(
      BUILT_IN_AGENT_PROFILE_TEMPLATES.map((template) => template.role),
    );
    expect(profiles.every((profile) => profile.builtIn)).toBe(true);
    // Profile identifiers are unique across the installation, so a new Site cannot reuse the ones
    // the migrations gave the Site this installation started with.
    expect(new Set(profiles.map((profile) => profile.id)).size).toBe(profiles.length);
  });

  it("writes the Site and its Profiles as one act, so a Site is never left unstaffed", async () => {
    const { repository: sites, create } = repository();
    const workflow = createCreateSite({ sites, createUuid: identifiers() });

    await workflow({ name: "Second", domain: "second.example", description: "Second." });

    expect(create).toHaveBeenCalledOnce();
  });

  it("stores the hostname the operator typed in the one spelling the database accepts", async () => {
    const { repository: sites, create } = repository();
    const workflow = createCreateSite({ sites, createUuid: identifiers() });

    await workflow({
      name: "  Second Newsroom  ",
      domain: "  Second.Example.  ",
      description: "  A second newsroom.  ",
    });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      name: "Second Newsroom",
      domain: "second.example",
      description: "A second newsroom.",
    });
  });

  it("reports a domain another Site already publishes in words", async () => {
    const taken: CreateSiteResult = {
      ok: false,
      error: {
        code: "SITE_DOMAIN_TAKEN",
        message: "Another Site already publishes second.example.",
        domain: "second.example",
      },
    };
    const { repository: sites } = repository(taken);
    const workflow = createCreateSite({ sites, createUuid: identifiers() });

    await expect(
      workflow({ name: "Second", domain: "second.example", description: "Second." }),
    ).resolves.toEqual(taken);
  });

  it.each([
    [{ name: "  ", domain: "second.example", description: "Second." }, "SITE_NAME_REQUIRED"],
    [{ name: "Second", domain: "second.example", description: " " }, "SITE_DESCRIPTION_REQUIRED"],
    [
      { name: "Second", domain: "https://second.example", description: "S." },
      "INVALID_SITE_DOMAIN",
    ],
    [{ name: "Second", domain: "  ", description: "Second." }, "SITE_DOMAIN_REQUIRED"],
  ])("refuses %o with %s and writes nothing", async (command, code) => {
    const { repository: sites, create } = repository();
    const workflow = createCreateSite({ sites, createUuid: identifiers() });

    const result = await workflow(command);

    expect(result).toEqual({ ok: false, error: { code, message: expect.any(String) } });
    expect(create).not.toHaveBeenCalled();
  });
});
