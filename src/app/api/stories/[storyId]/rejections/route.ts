import { createRejectStoryHttpHandler } from "@/interfaces/http/reject-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = createRejectStoryHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
