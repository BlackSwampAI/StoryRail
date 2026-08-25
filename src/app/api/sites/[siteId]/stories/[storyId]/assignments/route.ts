import { createAssignStoryHttpHandler } from "@/interfaces/http/assign-story-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createAssignStoryHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
