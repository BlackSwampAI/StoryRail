import { createSiteDirectoryRuntimeFromEnvironment, type SiteDirectoryRuntime } from "@/runtime";
import type { SiteId } from "@/domain/editorial";

export interface SiteDirectoryProvider {
  get(): SiteDirectoryRuntime;
  /** Whether a Site exists, answered cheaply enough to sit in front of every request. */
  exists(site: SiteId): Promise<boolean>;
  /** Called when a Site is created so the next request for it need not go back to the database. */
  remember(site: SiteId): void;
}

export function createSiteDirectoryProvider(
  createDirectory: () => SiteDirectoryRuntime = createSiteDirectoryRuntimeFromEnvironment,
): SiteDirectoryProvider {
  let directory: SiteDirectoryRuntime | undefined;
  // Only Sites that were found are remembered. A Site cannot be deleted, so a positive answer
  // stays true and the set is bounded by the installation. Remembering a negative answer would
  // let an unknown identifier in a URL grow this without limit, which is exactly the hole the
  // Site check exists to close.
  const known = new Set<SiteId>();

  const get = (): SiteDirectoryRuntime => {
    directory ??= createDirectory();
    return directory;
  };

  return Object.freeze({
    get,
    async exists(site: SiteId): Promise<boolean> {
      if (known.has(site)) {
        return true;
      }
      const found = await get().findSite(site);
      if (found === null) {
        return false;
      }
      known.add(site);
      return true;
    },
    remember(site: SiteId): void {
      known.add(site);
    },
  });
}

export const siteDirectoryProvider: SiteDirectoryProvider = createSiteDirectoryProvider();
