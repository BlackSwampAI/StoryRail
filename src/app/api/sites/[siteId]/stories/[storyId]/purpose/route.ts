import { createUpdateStoryPurposeHttpHandler } from "@/interfaces/http/update-story-purpose-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const PATCH = withSite((site) =>
  createUpdateStoryPurposeHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
