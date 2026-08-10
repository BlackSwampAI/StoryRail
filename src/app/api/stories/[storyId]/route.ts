import { createInspectStoryHttpHandler } from "@/interfaces/http/inspect-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = createInspectStoryHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
