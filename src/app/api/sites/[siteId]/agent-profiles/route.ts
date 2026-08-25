import { createCreateCustomWriterProfileHttpHandler } from "@/interfaces/http/create-custom-writer-profile-handler";
import { createListAgentProfilesHttpHandler } from "@/interfaces/http/list-agent-profiles-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createListAgentProfilesHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
export const POST = withSite((site) =>
  createCreateCustomWriterProfileHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
