import type { Pool } from "pg";

import { createPostgresSiteRepository } from "@/adapters/site-persistence";
import type { NewsroomIdentity, SiteId } from "@/domain/editorial";

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
