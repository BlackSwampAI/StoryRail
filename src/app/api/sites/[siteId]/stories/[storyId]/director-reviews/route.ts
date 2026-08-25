import { createRunDirectorReviewHttpHandler } from "@/interfaces/http/run-director-review-handler";
import { withSite } from "@/server/site-route";
import { directorRuntimeProvider } from "@/server/director-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createRunDirectorReviewHttpHandler({ getRuntime: () => directorRuntimeProvider.get(site) }),
);
