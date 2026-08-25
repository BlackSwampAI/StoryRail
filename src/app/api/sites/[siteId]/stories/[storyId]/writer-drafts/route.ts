import { createWriterDraftHttpHandler } from "@/interfaces/http/create-writer-draft-handler";
import { withSite } from "@/server/site-route";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createWriterDraftHttpHandler({ getRuntime: () => writerRuntimeProvider.get(site) }),
);
