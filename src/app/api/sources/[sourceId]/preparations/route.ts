import { createPrepareSourceEvidenceHttpHandler } from "@/interfaces/http/prepare-source-evidence-handler";
import { evidencePreparationRuntimeProvider } from "@/server/evidence-preparation-runtime-provider";

export const runtime = "nodejs";

export const POST = createPrepareSourceEvidenceHttpHandler({
  getRuntime: evidencePreparationRuntimeProvider.get,
});
