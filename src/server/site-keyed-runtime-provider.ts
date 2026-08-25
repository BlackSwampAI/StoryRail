import type { SiteId } from "@/domain/editorial";

export interface SiteKeyedRuntimeProvider<TRuntime> {
  get(site: SiteId): TRuntime;
}

/**
 * One runtime per Site, built the first time that Site is asked for and kept afterwards.
 *
 * A runtime owns a connection pool, so building one per request would exhaust PostgreSQL and
 * building one per process would serve every tenant from the first Site to arrive. Caching by
 * Site is only safe because the route wrapper refuses an unknown Site before it ever reaches
 * here: the keys are Sites that exist, not whatever a stranger typed into the path, so the map
 * is bounded by the installation rather than by traffic.
 */
export function createSiteKeyedRuntimeProvider<TRuntime>(
  createRuntime: (site: SiteId) => TRuntime,
): SiteKeyedRuntimeProvider<TRuntime> {
  const runtimes = new Map<SiteId, TRuntime>();

  return Object.freeze({
    get(site: SiteId): TRuntime {
      const existing = runtimes.get(site);
      if (existing !== undefined) {
        return existing;
      }

      // A construction failure is deliberately not remembered. It is usually a missing
      // environment variable, and an operator who fixes it should not have to restart.
      const runtime = createRuntime(site);
      runtimes.set(site, runtime);
      return runtime;
    },
  });
}
