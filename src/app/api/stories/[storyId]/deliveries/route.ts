import { createDeliverStoryHttpHandler } from "@/interfaces/http/deliver-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createDeliverStoryHttpHandler({ getRuntime: storyRuntimeProvider.get });
