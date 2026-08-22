import { createPublishStoryHttpHandler } from "@/interfaces/http/publish-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createPublishStoryHttpHandler({ getRuntime: storyRuntimeProvider.get });
