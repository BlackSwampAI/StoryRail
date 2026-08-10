import type { StoryRuntime } from "@/runtime";

export interface ListStoriesHttpHandlerDependencies {
  readonly getRuntime: () => StoryRuntime;
}

export type ListStoriesHttpHandler = (request: Request) => Promise<Response>;

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const INTERNAL_SERVER_ERROR_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "INTERNAL_SERVER_ERROR",
    message: "The Story request could not be completed.",
  }),
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_RESPONSE_HEADERS });
}

export function createListStoriesHttpHandler(
  dependencies: ListStoriesHttpHandlerDependencies,
): ListStoriesHttpHandler {
  return async () => {
    try {
      const stories = await dependencies.getRuntime().listStories();
      return jsonResponse({ ok: true, stories }, 200);
    } catch {
      return jsonResponse(INTERNAL_SERVER_ERROR_RESPONSE, 500);
    }
  };
}
