import { createRunAutopilotHttpHandler } from "@/interfaces/http/run-autopilot-handler";
import { assignmentEditorRuntimeProvider } from "@/server/assignment-editor-runtime-provider";
import { directorRuntimeProvider } from "@/server/director-runtime-provider";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

export const runtime = "nodejs";

// Autopilot needs four runtimes, and the runtimes deliberately do not know about each other:
// each owns its own connection pool. Composing them is an interface-layer concern, so the
// orchestrator lives here rather than inside a runtime.
export const POST = createRunAutopilotHttpHandler({
  getRuntimes: () => ({
    story: storyRuntimeProvider.get(),
    assignmentEditor: assignmentEditorRuntimeProvider.get(),
    writer: writerRuntimeProvider.get(),
    director: directorRuntimeProvider.get(),
  }),
});
