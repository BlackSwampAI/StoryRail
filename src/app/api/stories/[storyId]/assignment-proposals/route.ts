import { createGenerateAssignmentProposalHttpHandler } from "@/interfaces/http/generate-assignment-proposal-handler";
import { assignmentEditorRuntimeProvider } from "@/server/assignment-editor-runtime-provider";

export const runtime = "nodejs";

export const POST = createGenerateAssignmentProposalHttpHandler({
  getRuntime: assignmentEditorRuntimeProvider.get,
});
