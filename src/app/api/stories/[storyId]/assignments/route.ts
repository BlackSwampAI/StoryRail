import { createAssignStoryHttpHandler } from "@/interfaces/http/assign-story-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = createAssignStoryHttpHandler({ getRuntime: storyRuntimeProvider.get });
