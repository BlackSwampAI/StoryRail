import { createRunAutopilotHttpHandler } from "@/interfaces/http/run-autopilot-handler";
import { assignmentEditorRuntimeProvider } from "@/server/assignment-editor-runtime-provider";
import { directorRuntimeProvider } from "@/server/director-runtime-provider";
import { researcherRuntimeProvider } from "@/server/researcher-runtime-provider";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

import type { SiteId } from "@/domain/editorial";

export const runtime = "nodejs";

// Autopilot needs four runtimes, and the runtimes deliberately do not know about each other:
// each owns its own connection pool. Composing them is an interface-layer concern, so the
// orchestrator lives here rather than inside a runtime.
function researchConfigured(site: SiteId): boolean {
  try {
    researcherRuntimeProvider.get(site);
    return true;
  } catch {
    return false;
  }
}

export const POST = withSite((site) =>
  createRunAutopilotHttpHandler({
    getRuntimes: () => ({
      story: storyRuntimeProvider.get(site),
      policyRuns: storyRuntimeProvider.get(site).policyRuns,
      assignmentEditor: assignmentEditorRuntimeProvider.get(site),
      writer: writerRuntimeProvider.get(site),
      director: directorRuntimeProvider.get(site),
      // Research is only composed where it is configured; autopilot runs without it.
      researcher: researchConfigured(site) ? researcherRuntimeProvider.get(site) : undefined,
    }),
  }),
);
