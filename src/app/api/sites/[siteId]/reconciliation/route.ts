import { createReconcileAbandonedWorkHttpHandler } from "@/interfaces/http/reconcile-abandoned-work-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createReconcileAbandonedWorkHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
