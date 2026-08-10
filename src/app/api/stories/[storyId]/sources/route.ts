import { createAttachSourceToStoryHttpHandler } from "@/interfaces/http/attach-source-to-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createAttachSourceToStoryHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
