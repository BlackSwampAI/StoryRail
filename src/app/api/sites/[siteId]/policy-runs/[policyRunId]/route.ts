import { createReadPolicyRunHttpHandler } from "@/interfaces/http/read-policy-run-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const GET = withSite((site) =>
  createReadPolicyRunHttpHandler({ getRuntime: () => storyRuntimeProvider.get(site) }),
);
