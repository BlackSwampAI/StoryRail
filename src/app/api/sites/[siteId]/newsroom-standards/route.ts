import {
  createListNewsroomStandardsHttpHandler,
  createSetNewsroomStandardsHttpHandler,
} from "@/interfaces/http/newsroom-standards-handlers";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createListNewsroomStandardsHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
export const POST = withSite((site) =>
  createSetNewsroomStandardsHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
