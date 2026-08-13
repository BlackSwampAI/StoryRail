import { createRecordStoryReviewDecisionHttpHandler } from "@/interfaces/http/record-story-review-decision-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = createRecordStoryReviewDecisionHttpHandler({
  getRuntime: storyRuntimeProvider.get,
});
