import { createInspectStoryHttpHandler } from "@/interfaces/http/inspect-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createInspectStoryHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
