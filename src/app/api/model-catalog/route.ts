import { createReadModelCatalogHttpHandler } from "@/interfaces/http/model-catalog-handlers";
import { modelCatalogProvider } from "@/server/model-catalog-provider";

export const runtime = "nodejs";

export const GET = createReadModelCatalogHttpHandler({ getCatalog: modelCatalogProvider.get });
