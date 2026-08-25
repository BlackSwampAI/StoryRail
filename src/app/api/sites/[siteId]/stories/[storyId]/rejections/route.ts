import { createRejectStoryHttpHandler } from "@/interfaces/http/reject-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createRejectStoryHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
