import { createWriterRevisionHttpHandler } from "@/interfaces/http/create-writer-revision-handler";
import { writerRuntimeProvider } from "@/server/writer-runtime-provider";

export const runtime = "nodejs";
export const POST = createWriterRevisionHttpHandler({ getRuntime: writerRuntimeProvider.get });
