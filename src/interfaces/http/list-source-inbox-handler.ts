import type { StoryRuntime } from "@/runtime";

export function createListSourceInboxHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}): () => Promise<Response> {
  return async () => {
    try {
      const sources = await dependencies.getRuntime().listPendingSources();
      return Response.json(
        { ok: true, sources },
        { status: 200, headers: { "Cache-Control": "no-store" } },
      );
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The Source Inbox request could not be completed.",
          },
        },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
