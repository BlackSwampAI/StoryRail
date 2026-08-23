import {
  createReadSiteSettingsHttpHandler,
  createUpdateSiteSettingsHttpHandler,
} from "@/interfaces/http/site-settings-handlers";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = createReadSiteSettingsHttpHandler({ getRuntime: storyRuntimeProvider.get });
export const PUT = createUpdateSiteSettingsHttpHandler({ getRuntime: storyRuntimeProvider.get });
