import { createExtractPersistedSourceHttpHandler } from "@/interfaces/http/extract-persisted-source-handler";
import { withSite } from "@/server/site-route";
import { sourceEvidenceRuntimeProvider } from "@/server/source-evidence-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createExtractPersistedSourceHttpHandler({
    getRuntime: () => sourceEvidenceRuntimeProvider.get(site),
  }),
);
