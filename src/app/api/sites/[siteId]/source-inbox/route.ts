import { createListSourceInboxHttpHandler } from "@/interfaces/http/list-source-inbox-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createListSourceInboxHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
