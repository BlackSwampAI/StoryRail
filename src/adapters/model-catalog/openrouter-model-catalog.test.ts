import { describe, expect, it, vi } from "vitest";

import { createOpenRouterModelCatalog } from "./openrouter-model-catalog";

interface CatalogEntry {
  readonly id: string;
  readonly name: string;
  readonly context_length: number;
  readonly supported_parameters: readonly string[];
}

function entry(id: string, name: string, parameters: readonly string[]): CatalogEntry {
  return { id, name, context_length: 128000, supported_parameters: parameters };
}

function catalogResponse(entries: readonly CatalogEntry[]): Response {
  return new Response(JSON.stringify({ data: entries }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("the OpenRouter model catalog", () => {
  it("never offers a model that cannot return structured output", async () => {
    const catalog = createOpenRouterModelCatalog({
      fetch: vi.fn(() =>
        Promise.resolve(
          catalogResponse([
            entry("vendor/schema-capable", "Vendor: Schema Capable", [
              "temperature",
              "structured_outputs",
            ]),
            entry("vendor/text-only", "Vendor: Text Only", ["temperature"]),
          ]),
        ),
      ),
    });

    const result = await catalog.list();

    expect(result.ok).toBe(true);
    expect(result.ok && result.models.map((model) => model.id)).toEqual(["vendor/schema-capable"]);
  });

  it("orders the models by name rather than by however the provider listed them", async () => {
    const catalog = createOpenRouterModelCatalog({
      fetch: vi.fn(() =>
        Promise.resolve(
          catalogResponse([
            entry("z/third", "Zeta: Third", ["structured_outputs"]),
            entry("a/first", "Alpha: First", ["structured_outputs"]),
            entry("m/second", "Mu: Second", ["structured_outputs"]),
          ]),
        ),
      ),
    });

    const result = await catalog.list();

    expect(result.ok && result.models.map((model) => model.name)).toEqual([
      "Alpha: First",
      "Mu: Second",
      "Zeta: Third",
    ]);
  });

  it("carries only what a picker needs, leaving the provider's descriptions behind", async () => {
    const catalog = createOpenRouterModelCatalog({
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                {
                  id: "vendor/one",
                  name: "Vendor: One",
                  context_length: 64000,
                  description: "Several paragraphs nobody chooses a model by.",
                  pricing: { prompt: "0.000001" },
                  supported_parameters: ["structured_outputs"],
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    });

    const result = await catalog.list();

    expect(result.ok && result.models).toEqual([
      { id: "vendor/one", name: "Vendor: One", contextLength: 64000 },
    ]);
  });

  it("answers a second request within the cache window without calling the provider again", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        catalogResponse([entry("vendor/one", "Vendor: One", ["structured_outputs"])]),
      ),
    );
    let clock = 0;
    const catalog = createOpenRouterModelCatalog({
      fetch: fetchImpl,
      now: () => clock,
      ttlMs: 1000,
    });

    await catalog.list();
    clock = 999;
    const cached = await catalog.list();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(cached.ok && cached.models).toHaveLength(1);

    clock = 1001;
    await catalog.list();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failure, so a moment of downtime does not empty the picker for an hour", async () => {
    const fetchImpl = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue(
        catalogResponse([entry("vendor/one", "Vendor: One", ["structured_outputs"])]),
      );
    const catalog = createOpenRouterModelCatalog({ fetch: fetchImpl, ttlMs: 60_000 });

    const failed = await catalog.list();
    expect(failed).toEqual({
      ok: false,
      error: {
        code: "MODEL_CATALOG_UNAVAILABLE",
        message: "The model catalog could not be reached.",
      },
    });

    const recovered = await catalog.list();
    expect(recovered.ok && recovered.models).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports a catalog it cannot read as rejected rather than as an empty list", async () => {
    const catalog = createOpenRouterModelCatalog({
      fetch: vi.fn(() => Promise.resolve(new Response("not json at all", { status: 200 }))),
    });

    const result = await catalog.list();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("MODEL_CATALOG_REJECTED");
  });

  it("reports an unhappy provider as unavailable and says what it answered", async () => {
    const catalog = createOpenRouterModelCatalog({
      fetch: vi.fn(() => Promise.resolve(new Response("", { status: 503 }))),
    });

    const result = await catalog.list();

    expect(!result.ok && result.error.code).toBe("MODEL_CATALOG_UNAVAILABLE");
    expect(!result.ok && result.error.message).toContain("503");
  });
});
