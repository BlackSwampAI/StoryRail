import { createResearchStorySourcesHttpHandler } from "@/interfaces/http/research-story-sources-handler";
import { researcherRuntimeProvider } from "@/server/researcher-runtime-provider";

export const runtime = "nodejs";

export const POST = createResearchStorySourcesHttpHandler({
  getRuntime: researcherRuntimeProvider.get,
});
