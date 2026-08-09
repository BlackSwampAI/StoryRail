import { createPreserveAndExtractUrlSourceHttpHandler } from "@/interfaces/http/preserve-and-extract-url-source-handler";
import { sourceEvidenceRuntimeProvider } from "@/server/source-evidence-runtime-provider";

export const runtime = "nodejs";

export const POST = createPreserveAndExtractUrlSourceHttpHandler({
  getRuntime: sourceEvidenceRuntimeProvider.get,
});
