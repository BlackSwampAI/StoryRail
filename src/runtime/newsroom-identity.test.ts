// @vitest-environment node

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { siteId } from "@/domain/editorial";

import { createNewsroomIdentityReader } from "./newsroom-identity";

const SITE = siteId("site-default");

function poolAnswering(payloads: readonly unknown[]) {
  const remaining = [...payloads];
  const query = vi.fn(async () => {
    const payload = remaining.shift();
    return payload === undefined ? { rows: [], rowCount: 0 } : { rows: [{ payload }], rowCount: 1 };
  });
  return { pool: { query } as unknown as Pool, query };
}

describe("the newsroom identity a runtime hands to a run", () => {
  it("reads the description that is current when the run starts, not when the process began", async () => {
    // A runtime is cached for the life of the process, so a description read at composition time
    // would be the one that process used until it restarted.
    const { pool } = poolAnswering([
      {
        id: "site-default",
        name: "Black Swamp AI",
        domain: "blog.blackswampai.com",
        description: "Guides, Tips and News from the AI World",
      },
      {
        id: "site-default",
        name: "Black Swamp AI",
        domain: "blog.blackswampai.com",
        description: "Practical AI for small business owners",
      },
    ]);
    const read = createNewsroomIdentityReader({ pool, siteId: SITE });

    await expect(read()).resolves.toEqual({
      name: "Black Swamp AI",
      description: "Guides, Tips and News from the AI World",
    });
    await expect(read()).resolves.toEqual({
      name: "Black Swamp AI",
      description: "Practical AI for small business owners",
    });
  });

  it("reports nothing for a Site the directory no longer holds", async () => {
    const { pool } = poolAnswering([]);

    await expect(createNewsroomIdentityReader({ pool, siteId: SITE })()).resolves.toBeNull();
  });

  it("touches the database only when a run actually asks", () => {
    const { pool, query } = poolAnswering([]);

    createNewsroomIdentityReader({ pool, siteId: SITE });

    expect(query).not.toHaveBeenCalled();
  });
});
