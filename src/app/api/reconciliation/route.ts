import { createReconcileAbandonedWorkHttpHandler } from "@/interfaces/http/reconcile-abandoned-work-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createReconcileAbandonedWorkHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
