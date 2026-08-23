// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";

import { createPostgresSiteRepository } from "./postgres-site-repository";

const SITE = {
  id: "site-default",
  name: "Default Newsroom",
  domain: "localhost",
  description: "The newsroom this installation started with.",
};

function repositoryFor(rows: readonly { payload: unknown }[]) {
  const query = vi.fn(async () => ({ rows }));
  return {
    query,
    repository: createPostgresSiteRepository({ pool: { query } as unknown as Pool }),
  };
}

describe("createPostgresSiteRepository", () => {
  it("reads a Site back by its identifier", async () => {
    const { repository } = repositoryFor([{ payload: SITE }]);

    await expect(repository.findById(siteId("site-default"))).resolves.toEqual(SITE);
  });

  it("reports a Site that was never created as absent rather than inventing one", async () => {
    const { repository } = repositoryFor([]);

    await expect(repository.findById(siteId("site-imaginary"))).resolves.toBeNull();
  });

  it("refuses a persisted Site missing the name a newsroom is known by", async () => {
    const { repository } = repositoryFor([{ payload: { ...SITE, name: "  " } }]);

    await expect(repository.list()).rejects.toMatchObject({
      name: "PostgresSiteInvariantError",
    });
  });
});
