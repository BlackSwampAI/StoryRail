import type {
  DeliveryDestinationDirectory,
  ResolveDeliveryDestinationResult,
} from "@/application/story-deliveries";
import type { SiteSettingsRepository } from "@/application/site-settings";
import { STUDIOCMS_API_TOKEN_SLOT, type ApiKeyResolution } from "@/domain/editorial";

import { createStudioCmsDestination } from "./studiocms-destination";

/**
 * The Site's configured destination, read at the moment a delivery is asked for.
 *
 * Never at composition time: a runtime is cached for the life of the process, so a token read
 * while it was built would be the token that process used until it restarted, and a key entered
 * in the settings screen would appear to do nothing.
 *
 * Both halves are resolved before any record exists. An unconfigured destination and an
 * unreadable token are the same kind of answer — nothing was attempted — and a delivery row for
 * an attempt that never had a chance to run would be a lie in the audit trail.
 */
export function createSiteDeliveryDestinationDirectory(dependencies: {
  readonly settings: SiteSettingsRepository;
  readonly resolveApiKey: (slot: typeof STUDIOCMS_API_TOKEN_SLOT) => Promise<ApiKeyResolution>;
  readonly fetch?: typeof globalThis.fetch;
}): DeliveryDestinationDirectory {
  return {
    async resolve(): Promise<ResolveDeliveryDestinationResult> {
      const stored = await dependencies.settings.find();
      const destination = stored?.destination;
      if (!destination)
        return {
          ok: false,
          error: {
            code: "DESTINATION_NOT_CONFIGURED",
            message: "This newsroom has no destination to deliver to.",
          },
        };

      const token = await dependencies.resolveApiKey(STUDIOCMS_API_TOKEN_SLOT);
      if (!token.ok) return { ok: false, error: token.error };

      return {
        ok: true,
        destination: createStudioCmsDestination({
          settings: destination,
          apiToken: token.apiKey,
          fetch: dependencies.fetch,
        }),
      };
    },
  };
}
