/**
 * One model a provider will route to, reduced to what a picker needs.
 *
 * The raw catalog carries a description and a pricing table for several hundred models. None of
 * that decides which model a role runs on, so it stops at the adapter rather than travelling to
 * a browser.
 */
export interface CatalogModel {
  readonly id: string;
  readonly name: string;
  readonly contextLength: number;
}

export type ModelCatalogFailureCode = "MODEL_CATALOG_UNAVAILABLE" | "MODEL_CATALOG_REJECTED";

export type ModelCatalogResult =
  | { readonly ok: true; readonly models: readonly CatalogModel[] }
  | {
      readonly ok: false;
      readonly error: { readonly code: ModelCatalogFailureCode; readonly message: string };
    };

/**
 * The models a provider offers that StoryRail can actually run on.
 *
 * A failure is a value rather than a thrown error because a catalog a provider cannot answer for
 * is an ordinary condition here: the settings screen still has to render, and saving must not
 * depend on a third party being up.
 */
export interface ModelCatalog {
  list(): Promise<ModelCatalogResult>;
}

/**
 * The providers a catalog adapter exists for, which today is one.
 *
 * This is deliberately not "providers with a configured credential". The catalog needs no key, so
 * an operator can choose models before entering one, and first-run order is not forced on them.
 */
export const MODEL_CATALOG_PROVIDERS = [
  Object.freeze({ id: "openrouter", name: "OpenRouter" }),
] as const;

export type ModelCatalogProviderId = (typeof MODEL_CATALOG_PROVIDERS)[number]["id"];
