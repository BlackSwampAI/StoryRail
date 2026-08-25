import { createRecordStoryReviewDecisionHttpHandler } from "@/interfaces/http/record-story-review-decision-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createRecordStoryReviewDecisionHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
