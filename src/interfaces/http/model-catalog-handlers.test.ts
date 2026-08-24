import { describe, expect, it } from "vitest";

import type { ModelCatalog } from "@/application/model-catalog";

import { createReadModelCatalogHttpHandler } from "./model-catalog-handlers";

describe("the model catalog route", () => {
  it("answers with the models a role may be set to", async () => {
    const catalog: ModelCatalog = {
      list: () =>
        Promise.resolve({
          ok: true,
          models: [{ id: "vendor/one", name: "Vendor: One", contextLength: 64000 }],
        }),
    };

    const response = await createReadModelCatalogHttpHandler({ getCatalog: () => catalog })();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      models: [{ id: "vendor/one", name: "Vendor: One", contextLength: 64000 }],
    });
  });

  it("names the reason the catalog is missing rather than answering a bare 500", async () => {
    const catalog: ModelCatalog = {
      list: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "MODEL_CATALOG_UNAVAILABLE",
            message: "The catalog could not be reached.",
          },
        }),
    };

    const response = await createReadModelCatalogHttpHandler({ getCatalog: () => catalog })();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "MODEL_CATALOG_UNAVAILABLE", message: "The catalog could not be reached." },
    });
  });

  it("names a thrown failure too, because a screen still has to render", async () => {
    const catalog: ModelCatalog = {
      list: () => Promise.reject(new Error("socket hang up")),
    };

    const response = await createReadModelCatalogHttpHandler({ getCatalog: () => catalog })();

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "MODEL_CATALOG_UNAVAILABLE" },
    });
  });
});
