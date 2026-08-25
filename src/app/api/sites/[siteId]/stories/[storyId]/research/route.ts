import { createResearchStorySourcesHttpHandler } from "@/interfaces/http/research-story-sources-handler";
import { withSite } from "@/server/site-route";
import { researcherRuntimeProvider } from "@/server/researcher-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createResearchStorySourcesHttpHandler({
    getRuntime: () => researcherRuntimeProvider.get(site),
  }),
);
