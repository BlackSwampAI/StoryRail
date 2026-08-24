import { createOpenRouterModelCatalog } from "@/adapters/model-catalog";
import type { ModelCatalog } from "@/application/model-catalog";

export interface ModelCatalogProvider {
  get(): ModelCatalog;
}

/**
 * The catalog is built once per process because its cache lives inside it. A fresh adapter per
 * request would hold an empty cache and call the provider on every keystroke of a settings page.
 */
export function createModelCatalogProvider(
  createCatalog: () => ModelCatalog = () => createOpenRouterModelCatalog(),
): ModelCatalogProvider {
  let catalog: ModelCatalog | undefined;

  return Object.freeze({
    get(): ModelCatalog {
      catalog ??= createCatalog();
      return catalog;
    },
  });
}

export const modelCatalogProvider: ModelCatalogProvider = createModelCatalogProvider();
