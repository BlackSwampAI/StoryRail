import { createWriterRevisionHttpHandler } from "@/interfaces/http/create-writer-revision-handler";
import { withSite } from "@/server/site-route";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

export const runtime = "nodejs";
export const POST = withSite((site) =>
  createWriterRevisionHttpHandler({ getRuntime: () => writerRuntimeProvider.get(site) }),
);
