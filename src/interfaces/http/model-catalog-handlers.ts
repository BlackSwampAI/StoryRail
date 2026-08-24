import type { ModelCatalog } from "@/application/model-catalog";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

/**
 * The models a role may be set to.
 *
 * Nothing here is validated against what is already stored, and nothing stored is validated
 * against this. A saved slug is deliberately never checked for membership in the catalog: doing
 * so would couple saving a setting to a third party being up, and a slug retired upstream months
 * after it was chosen would start failing validation and lock an operator out of a screen that
 * had been working. The picker offering only compatible models is where that constraint lives.
 */
export function createReadModelCatalogHttpHandler(dependencies: {
  readonly getCatalog: () => ModelCatalog;
}) {
  return async (): Promise<Response> => {
    try {
      const result = await dependencies.getCatalog().list();
      return result.ok
        ? respond({ ok: true, models: result.models }, 200)
        : respond({ ok: false, error: result.error }, 502);
    } catch {
      // A catalog that throws is still an unavailable catalog, and the settings screen has a
      // sentence for that. A bare 500 would tell it only that something went wrong.
      return respond(
        {
          ok: false,
          error: {
            code: "MODEL_CATALOG_UNAVAILABLE",
            message: "The model catalog could not be reached.",
          },
        },
        502,
      );
    }
  };
}
