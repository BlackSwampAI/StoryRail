import type { CatalogModel } from "@/application/model-catalog";

export const MODEL_CATALOG_UNAVAILABLE_MESSAGE =
  "The model catalog is unavailable, so the current models are shown as stored.";

export type ModelCatalogClientResult =
  | { readonly kind: "loaded"; readonly models: readonly CatalogModel[] }
  | { readonly kind: "unavailable"; readonly message: string };

export interface ModelCatalogClient {
  readonly readCatalog: () => Promise<ModelCatalogClientResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCatalogModel(value: unknown): value is CatalogModel {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.contextLength === "number" &&
    Number.isFinite(value.contextLength)
  );
}

const unavailable = (): ModelCatalogClientResult => ({
  kind: "unavailable",
  message: MODEL_CATALOG_UNAVAILABLE_MESSAGE,
});

export function createModelCatalogClient(dependencies: {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): ModelCatalogClient {
  return {
    async readCatalog() {
      try {
        const response = await dependencies.fetch("/api/model-catalog", {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body) || body.ok !== true || !Array.isArray(body.models))
          return unavailable();
        return body.models.every(isCatalogModel)
          ? { kind: "loaded", models: body.models }
          : unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}

export const modelCatalogClient = createModelCatalogClient({
  fetch: (input, init) => globalThis.fetch(input, init),
});
