import { createRecordSourceTriageDecisionHttpHandler } from "@/interfaces/http/record-source-triage-decision-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const PUT = createRecordSourceTriageDecisionHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
