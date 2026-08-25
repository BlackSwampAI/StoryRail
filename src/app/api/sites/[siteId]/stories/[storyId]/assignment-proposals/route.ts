import { createGenerateAssignmentProposalHttpHandler } from "@/interfaces/http/generate-assignment-proposal-handler";
import { withSite } from "@/server/site-route";
import { assignmentEditorRuntimeProvider } from "@/server/assignment-editor-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createGenerateAssignmentProposalHttpHandler({
    getRuntime: () => assignmentEditorRuntimeProvider.get(site),
  }),
);
