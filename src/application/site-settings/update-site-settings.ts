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
    await dependencies.settings.update({
      settings: validated.settings,
      updatedAt: dependencies.now(),
    });
    return { ok: true, settings: validated.settings };
  };
}

export type UpdateSiteSettingsWorkflow = ReturnType<typeof createUpdateSiteSettings>;
