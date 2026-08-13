import { createRunDirectorReviewHttpHandler } from "@/interfaces/http/run-director-review-handler";
import { directorRuntimeProvider } from "@/server/director-runtime-provider";

export const runtime = "nodejs";
export const POST = createRunDirectorReviewHttpHandler({ getRuntime: directorRuntimeProvider.get });
