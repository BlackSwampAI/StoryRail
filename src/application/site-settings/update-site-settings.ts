import { recordSiteSettings, type SiteSettings } from "@/domain/editorial";

import type { SiteSettingsRepository } from "./site-settings-repository";

export type UpdateSiteSettingsResult =
  | { readonly ok: true; readonly settings: SiteSettings }
  | {
      readonly ok: false;
      readonly error: { readonly code: string; readonly message: string };
    };

export function createUpdateSiteSettings(dependencies: {
  readonly settings: SiteSettingsRepository;
  readonly now: () => string;
}) {
  return async (candidate: unknown): Promise<UpdateSiteSettingsResult> => {
    const validated = recordSiteSettings(candidate);
    if (!validated.ok) return validated;

    // A submission that says nothing about the destination leaves the stored one alone, and only
    // an explicit null clears it. The settings screen sends models and no destination field, so
    // without this a newsroom would lose where it delivers the next time anybody changed a model.
    const mentionsDestination =
      typeof candidate === "object" && candidate !== null && "destination" in candidate;
    const settings: SiteSettings = mentionsDestination
      ? validated.settings
      : {
          ...validated.settings,
          destination: (await dependencies.settings.find())?.destination ?? null,
        };

    await dependencies.settings.update({ settings, updatedAt: dependencies.now() });
    return { ok: true, settings };
  };
}

export type UpdateSiteSettingsWorkflow = ReturnType<typeof createUpdateSiteSettings>;
