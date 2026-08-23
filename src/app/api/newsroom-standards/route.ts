import {
  createListNewsroomStandardsHttpHandler,
  createSetNewsroomStandardsHttpHandler,
} from "@/interfaces/http/newsroom-standards-handlers";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = createListNewsroomStandardsHttpHandler({ getRuntime: storyRuntimeProvider.get });
export const POST = createSetNewsroomStandardsHttpHandler({ getRuntime: storyRuntimeProvider.get });
