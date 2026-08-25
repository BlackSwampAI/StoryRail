import { createReadModelCatalogHttpHandler } from "@/interfaces/http/model-catalog-handlers";
import { modelCatalogProvider } from "@/server/model-catalog-provider";
import { withSite } from "@/server/site-route";

export const runtime = "nodejs";

// The catalog itself is the same for every Site, but it is read from a Site's settings screen and
// sits under that Site's path with everything else the newsroom fetches. One shape for every
// client request is worth more than saving this route a Site lookup.
export const GET = withSite(() =>
  createReadModelCatalogHttpHandler({ getCatalog: modelCatalogProvider.get }),
);
