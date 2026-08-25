import {
  createReadSiteSettingsHttpHandler,
  createUpdateSiteSettingsHttpHandler,
} from "@/interfaces/http/site-settings-handlers";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createReadSiteSettingsHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
export const PUT = withSite((site) =>
  createUpdateSiteSettingsHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
