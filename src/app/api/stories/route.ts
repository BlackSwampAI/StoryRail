import { createCreateStoryHttpHandler } from "@/interfaces/http/create-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createCreateStoryHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
