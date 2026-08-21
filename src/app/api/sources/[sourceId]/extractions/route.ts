import { createExtractPersistedSourceHttpHandler } from "@/interfaces/http/extract-persisted-source-handler";
import { sourceEvidenceRuntimeProvider } from "@/server/source-evidence-runtime-provider";

export const runtime = "nodejs";

export const POST = createExtractPersistedSourceHttpHandler({
  getRuntime: sourceEvidenceRuntimeProvider.get,
});
