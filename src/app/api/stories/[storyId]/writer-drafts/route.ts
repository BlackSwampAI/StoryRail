import { createWriterDraftHttpHandler } from "@/interfaces/http/create-writer-draft-handler";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

export const runtime = "nodejs";
export const POST = createWriterDraftHttpHandler({ getRuntime: writerRuntimeProvider.get });
