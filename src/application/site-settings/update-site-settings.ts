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
    // The same holds for search: the settings screen sends models and nothing else, so a
    // submission silent about either half must leave the stored half alone, and for the research
    // budget, which the same screen leaves out whenever an operator is changing something else.
    const mentions = (key: "destination" | "search" | "research") =>
      typeof candidate === "object" && candidate !== null && key in candidate;
    const mentionsDestination = mentions("destination");
    const mentionsSearch = mentions("search");
    const mentionsResearch = mentions("research");
    const stored =
      mentionsDestination && mentionsSearch && mentionsResearch
        ? null
        : await dependencies.settings.find();
    const settings: SiteSettings = {
      ...validated.settings,
      destination: mentionsDestination
        ? validated.settings.destination
        : (stored?.destination ?? null),
      search: mentionsSearch ? validated.settings.search : (stored?.search ?? null),
      research: mentionsResearch ? validated.settings.research : (stored?.research ?? null),
    };

    await dependencies.settings.update({ settings, updatedAt: dependencies.now() });
    return { ok: true, settings };
  };
}

export type UpdateSiteSettingsWorkflow = ReturnType<typeof createUpdateSiteSettings>;
