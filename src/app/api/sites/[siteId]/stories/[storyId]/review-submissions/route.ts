import { createSubmitStoryReviewHttpHandler } from "@/interfaces/http/submit-story-review-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createSubmitStoryReviewHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
