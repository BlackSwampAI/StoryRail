import { createCreateStoryHttpHandler } from "@/interfaces/http/create-story-handler";
import { createListStoriesHttpHandler } from "@/interfaces/http/list-stories-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createCreateStoryHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);

export const GET = withSite((site) =>
  createListStoriesHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
