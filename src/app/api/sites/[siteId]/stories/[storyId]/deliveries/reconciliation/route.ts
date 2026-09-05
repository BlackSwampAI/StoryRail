import { createReconcileStoryDeliveryHttpHandler } from "@/interfaces/http/reconcile-story-delivery-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createReconcileStoryDeliveryHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
