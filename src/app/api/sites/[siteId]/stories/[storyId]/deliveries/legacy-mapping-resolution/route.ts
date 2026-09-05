import { createResolveLegacyDeliveryMappingHttpHandler } from "@/interfaces/http/resolve-legacy-delivery-mapping-handler";
import { withSite } from "@/server/site-route";
import { storyRuntimeProvider } from "@/server/story-runtime-provider";

export const runtime = "nodejs";

export const POST = withSite((site) =>
  createResolveLegacyDeliveryMappingHttpHandler({
    getRuntime: () => storyRuntimeProvider.get(site),
  }),
);
