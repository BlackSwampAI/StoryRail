import { createListSourceInboxHttpHandler } from "@/interfaces/http/list-source-inbox-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = createListSourceInboxHttpHandler({ getRuntime: storyRuntimeProvider.get });
