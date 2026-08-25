import type {
  DeliveryDestinationDirectory,
  ResolveDeliveryDestinationResult,
} from "@/application/story-deliveries";
import type { SiteSettingsRepository } from "@/application/site-settings";
import {
  STUDIOCMS_API_TOKEN_SLOT,
  WORDPRESS_APPLICATION_PASSWORD_SLOT,
  type ApiKeyResolution,
  type CredentialSlot,
} from "@/domain/editorial";

import { createStudioCmsDestination } from "./studiocms-destination";
import { createWordPressDestination } from "./wordpress-destination";

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
  readonly resolveApiKey: (slot: CredentialSlot) => Promise<ApiKeyResolution>;
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

      // The kind decides which slot is read, so a newsroom that switched destinations cannot be
      // handed the other kind's secret and be told by the far end that its credential is wrong.
      const secret = await dependencies.resolveApiKey(
        destination.kind === "studiocms"
          ? STUDIOCMS_API_TOKEN_SLOT
          : WORDPRESS_APPLICATION_PASSWORD_SLOT,
      );
      if (!secret.ok) return { ok: false, error: secret.error };

      return {
        ok: true,
        destination:
          destination.kind === "studiocms"
            ? createStudioCmsDestination({
                settings: destination,
                apiToken: secret.apiKey,
                fetch: dependencies.fetch,
              })
            : createWordPressDestination({
                settings: destination,
                applicationPassword: secret.apiKey,
                fetch: dependencies.fetch,
              }),
      };
    },
  };
}
