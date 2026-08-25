import { createAttachSourceToStoryHttpHandler } from "@/interfaces/http/attach-source-to-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createAttachSourceToStoryHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
