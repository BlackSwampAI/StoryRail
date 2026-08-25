import { createPreserveAndExtractUrlSourceHttpHandler } from "@/interfaces/http/preserve-and-extract-url-source-handler";
import { withSite } from "@/server/site-route";
import { sourceEvidenceRuntimeProvider } from "@/server/source-evidence-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createPreserveAndExtractUrlSourceHttpHandler({
    getRuntime: () => sourceEvidenceRuntimeProvider.get(site),
  }),
);
