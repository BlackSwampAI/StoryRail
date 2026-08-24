import type { CatalogModel, ModelCatalog, ModelCatalogResult } from "@/application/model-catalog";

const OPENROUTER_MODELS_ENDPOINT = "https://openrouter.ai/api/v1/models";

/**
 * The parameter an entry must advertise before StoryRail will offer it.
 *
 * Every model call in this codebase asks for a schema back — a Director returns a full review
 * object — so a model without structured outputs does not fail occasionally, it fails every run
 * with MODEL_OUTPUT_INVALID, which is recorded and never retried. Filtering here is what makes
 * that configuration unreachable instead of merely discouraged.
 */
const STRUCTURED_OUTPUTS = "structured_outputs";

/**
 * How long a fetched catalog is reused. Long enough that opening the settings screen twice does
 * not call a third party twice, short enough that a model added upstream this morning is
 * offered this afternoon.
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

export interface OpenRouterModelCatalogOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(
  code: "MODEL_CATALOG_UNAVAILABLE" | "MODEL_CATALOG_REJECTED",
  message: string,
): ModelCatalogResult {
  return { ok: false, error: { code, message } };
}

function readEntry(entry: unknown): CatalogModel | null {
  if (!isRecord(entry)) return null;
  const { id, name, context_length: contextLength, supported_parameters: parameters } = entry;
  if (typeof id !== "string" || id.length === 0) return null;
  if (typeof name !== "string" || name.length === 0) return null;
  if (typeof contextLength !== "number" || !Number.isFinite(contextLength)) return null;
  if (!Array.isArray(parameters) || !parameters.includes(STRUCTURED_OUTPUTS)) return null;
  return { id, name, contextLength };
}

function readCatalog(body: unknown): readonly CatalogModel[] | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null;
  const models = body.data.flatMap((entry) => {
    const model = readEntry(entry);
    return model === null ? [] : [model];
  });
  // Names are present and unique across the compatible entries, so sorting by name gives a
  // stable order an operator can scan rather than the provider's own undocumented ordering.
  return [...models].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * OpenRouter's catalog, reduced to the models StoryRail can run on.
 *
 * The catalog is never written to Postgres. It is a third party's data that changes without
 * notice, so a stored copy would be a second copy of a value this codebase does not own, and it
 * would drift. It is cached in memory for a few minutes instead, and a failure is never cached:
 * an outage that lasted a second must not keep the picker empty for a quarter of an hour.
 */
export function createOpenRouterModelCatalog(
  options: OpenRouterModelCatalogOptions = {},
): ModelCatalog {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  let cached: { readonly models: readonly CatalogModel[]; readonly expiresAt: number } | null =
    null;

  return Object.freeze({
    async list(): Promise<ModelCatalogResult> {
      if (cached !== null && now() < cached.expiresAt) return { ok: true, models: cached.models };

      let response: Response;
      try {
        response = await fetchImpl(OPENROUTER_MODELS_ENDPOINT, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
      } catch {
        return failure("MODEL_CATALOG_UNAVAILABLE", "The model catalog could not be reached.");
      }

      if (!response.ok)
        return failure(
          "MODEL_CATALOG_UNAVAILABLE",
          `The model catalog answered ${String(response.status)}.`,
        );

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return failure("MODEL_CATALOG_REJECTED", "The model catalog answered with invalid JSON.");
      }

      const models = readCatalog(body);
      if (models === null)
        return failure(
          "MODEL_CATALOG_REJECTED",
          "The model catalog answered in a shape StoryRail does not recognise.",
        );

      cached = { models, expiresAt: now() + ttlMs };
      return { ok: true, models };
    },
  });
}
