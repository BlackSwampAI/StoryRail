import type { SiteSettingsRepository } from "@/application/site-settings";
import type { WebSearchProvider } from "@/application/web-search";
import {
  SEARXNG_PASSWORD_SLOT,
  type ApiKeyResolution,
  type CredentialSlot,
} from "@/domain/editorial";

import { createSearxngWebSearch } from "./searxng-web-search";

/**
 * The Site's search instance, read at the moment a run starts.
 *
 * Never at composition time: a runtime lives for as long as the process, so a password read while
 * it was built would be the one that process used until it restarted, and a credential entered on
 * the settings screen would appear to do nothing.
 *
 * Null is the ordinary answer. A newsroom that has configured no instance, or whose password
 * cannot be read, is given a Researcher without the tool rather than one holding a tool that
 * fails every time it is used — a model spends its budget on a tool it has, and there is nothing
 * useful it can do with one that cannot work.
 */
export function createSiteWebSearchDirectory(dependencies: {
  readonly settings: SiteSettingsRepository;
  readonly resolveApiKey: (slot: CredentialSlot) => Promise<ApiKeyResolution>;
  readonly fetch?: typeof globalThis.fetch;
}): () => Promise<WebSearchProvider | null> {
  return async () => {
    const stored = await dependencies.settings.find();
    const search = stored?.search;
    if (!search) return null;

    const password = await dependencies.resolveApiKey(SEARXNG_PASSWORD_SLOT);
    if (!password.ok) return null;

    return createSearxngWebSearch({
      settings: search,
      password: password.apiKey,
      fetch: dependencies.fetch,
    });
  };
}
