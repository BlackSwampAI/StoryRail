import { createSubmitStoryReviewHttpHandler } from "@/interfaces/http/submit-story-review-handler";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";
export const POST = createSubmitStoryReviewHttpHandler({ getRuntime: storyRuntimeProvider.get });
