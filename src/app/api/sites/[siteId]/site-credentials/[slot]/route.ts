import {
  createRemoveSiteCredentialHttpHandler,
  createSetSiteCredentialHttpHandler,
} from "@/interfaces/http/site-settings-handlers";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

// Write and delete only. There is no GET here, and adding one would undo the reason the store is
// encrypted at all.
export const PUT = withSite((site) =>
  createSetSiteCredentialHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
export const DELETE = withSite((site) =>
  createRemoveSiteCredentialHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
