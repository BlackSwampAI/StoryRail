import { createPublishStoryHttpHandler } from "@/interfaces/http/publish-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createPublishStoryHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
