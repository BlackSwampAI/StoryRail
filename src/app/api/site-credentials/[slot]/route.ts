import {
  createRemoveSiteCredentialHttpHandler,
  createSetSiteCredentialHttpHandler,
} from "@/interfaces/http/site-settings-handlers";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

// Write and delete only. There is no GET here, and adding one would undo the reason the store is
// encrypted at all.
export const PUT = createSetSiteCredentialHttpHandler({ getRuntime: storyRuntimeProvider.get });
export const DELETE = createRemoveSiteCredentialHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
