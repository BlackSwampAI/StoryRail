import type { SiteSettings } from "@/domain/editorial";

/**
 * Per-Site configuration, scoped to one Site by the adapter that implements it.
 *
 * `find` answers null for a Site that has never been configured rather than inventing a default,
 * because the defaults belong to the composition root that knows what this installation shipped
 * with, not to the store.
 */
export interface SiteSettingsRepository {
  find(): Promise<SiteSettings | null>;
  update(command: { readonly settings: SiteSettings; readonly updatedAt: string }): Promise<void>;
}
