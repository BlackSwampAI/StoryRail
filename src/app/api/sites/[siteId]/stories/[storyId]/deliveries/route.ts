import { createDeliverStoryHttpHandler } from "@/interfaces/http/deliver-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createDeliverStoryHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
