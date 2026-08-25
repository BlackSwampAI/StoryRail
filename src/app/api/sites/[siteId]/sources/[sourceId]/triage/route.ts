import { createRecordSourceTriageDecisionHttpHandler } from "@/interfaces/http/record-source-triage-decision-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const PUT = withSite((site) =>
  createRecordSourceTriageDecisionHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
