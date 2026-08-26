import { createRunUrlAutopilotHttpHandler } from "@/interfaces/http/run-url-autopilot-handler";
import { assignmentEditorRuntimeProvider } from "@/server/assignment-editor-runtime-provider";
import { directorRuntimeProvider } from "@/server/director-runtime-provider";
import { evidencePreparationRuntimeProvider } from "@/server/evidence-preparation-runtime-provider";
import { researcherRuntimeProvider } from "@/server/researcher-runtime-provider";
import { withSite } from "@/server/site-route";
import { sourceEvidenceRuntimeProvider } from "@/server/source-evidence-runtime-provider";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

import type { SiteId } from "@/domain/editorial";

export const runtime = "nodejs";

// A run that starts at a URL touches every runtime this installation has, and the runtimes
// deliberately do not know about each other: each owns its own connection pool. Composing them
// is an interface-layer concern, so the orchestrator lives here rather than inside a runtime.
function researchConfigured(site: SiteId): boolean {
  try {
    researcherRuntimeProvider.get(site);
    return true;
  } catch {
    return false;
  }
}

export const POST = withSite((site) =>
  createRunUrlAutopilotHttpHandler({
    getRuntimes: () => ({
      story: storyRuntimeProvider.get(site),
      policyRuns: storyRuntimeProvider.get(site).policyRuns,
      sourceEvidence: sourceEvidenceRuntimeProvider.get(site),
      evidencePreparation: evidencePreparationRuntimeProvider.get(site),
      assignmentEditor: assignmentEditorRuntimeProvider.get(site),
      writer: writerRuntimeProvider.get(site),
      director: directorRuntimeProvider.get(site),
      // Research is only composed where it is configured; autopilot runs without it.
      researcher: researchConfigured(site) ? researcherRuntimeProvider.get(site) : undefined,
    }),
  }),
);
