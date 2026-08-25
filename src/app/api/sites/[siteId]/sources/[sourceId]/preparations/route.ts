import { createPrepareSourceEvidenceHttpHandler } from "@/interfaces/http/prepare-source-evidence-handler";
import { withSite } from "@/server/site-route";
import { evidencePreparationRuntimeProvider } from "@/server/evidence-preparation-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createPrepareSourceEvidenceHttpHandler({
    getRuntime: () => evidencePreparationRuntimeProvider.get(site),
  }),
);
