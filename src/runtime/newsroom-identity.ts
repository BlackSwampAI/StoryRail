import type { Pool } from "pg";

import { createPostgresSiteRepository } from "@/adapters/site-persistence";
import type { NewsroomIdentity, SiteId } from "@/domain/editorial";
import { createPostgresNewsroomStandardsRepository } from "@/adapters/newsroom-standards-persistence";
import type { EditorialContextSnapshot } from "@/domain/editorial";

/**
 * Who this newsroom is, read at the moment a run starts.
 *
 * Never at composition time: a runtime is cached for the life of the process, so a description
 * read while it was built would be the one that process used until it restarted, and a
 * description the operator changed would appear to do nothing.
 */
export function createNewsroomIdentityReader(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): () => Promise<NewsroomIdentity | null> {
  const sites = createPostgresSiteRepository({ pool: dependencies.pool });
  return async () => {
    const site = await sites.findById(dependencies.siteId);
    return site === null ? null : { name: site.name, description: site.description };
  };
}

/** Reads the exact revision and Site identity together for a durable AgentRun snapshot. */
export function createEditorialContextReader(dependencies: {
  readonly pool: Pool;
  readonly siteId: SiteId;
}): () => Promise<EditorialContextSnapshot> {
  const standards = createPostgresNewsroomStandardsRepository(dependencies);
  const readIdentity = createNewsroomIdentityReader(dependencies);
  return async () => {
    const [history, identity] = await Promise.all([standards.list(), readIdentity()]);
    const bound = (value: string, limit: number) => {
      const marker = " …[clipped for agent context]";
      return value.length <= limit ? value : `${value.slice(0, limit - marker.length)}${marker}`;
    };
    const boundedIdentity =
      identity === null
        ? null
        : {
            name: bound(identity.name, 2_000),
            description: bound(identity.description, 8_000),
          };
    return { identity: boundedIdentity, standards: history.at(-1) ?? null };
  };
}
