import type { StoryRuntime } from "@/runtime";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

export function createListAgentProfilesHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (): Promise<Response> => {
    try {
      const profiles = await dependencies.getRuntime().listAgentProfiles();
      return new Response(JSON.stringify({ ok: true, profiles }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The Agent Profile request could not be completed.",
          },
        }),
        { status: 500, headers: JSON_HEADERS },
      );
    }
  };
}
