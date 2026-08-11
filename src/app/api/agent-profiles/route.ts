import { createCreateCustomWriterProfileHttpHandler } from "@/interfaces/http/create-custom-writer-profile-handler";
import { createListAgentProfilesHttpHandler } from "@/interfaces/http/list-agent-profiles-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = createListAgentProfilesHttpHandler({ getRuntime: storyRuntimeProvider.get });
export const POST = createCreateCustomWriterProfileHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
