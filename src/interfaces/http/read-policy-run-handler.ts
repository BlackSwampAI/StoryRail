import { policyRunId } from "@/domain/editorial";
import type { StoryRuntime } from "@/runtime";

export interface PolicyRunRouteContext {
  readonly params: Promise<{ readonly policyRunId: string }>;
}

const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers });

/**
 * Answers with one policy run, so a watcher can follow an automation that has no Story yet.
 *
 * A run started from a URL spends its first minutes preserving, extracting and preparing, and
 * only then creates the Story every other screen is keyed by. Until it does, this record is the
 * only thing that can say the work exists — and it is what tells the watcher which Story to
 * follow the moment there is one.
 */
export function createReadPolicyRunHttpHandler(dependencies: {
  readonly getRuntime: () => Pick<StoryRuntime, "policyRuns">;
}) {
  return async (_request: Request, context: PolicyRunRouteContext): Promise<Response> => {
    try {
      const route = await context.params;
      const run = await dependencies
        .getRuntime()
        .policyRuns.findById(policyRunId(route.policyRunId));
      return run === null
        ? respond(
            {
              ok: false,
              error: { code: "POLICY_RUN_NOT_FOUND", message: "The policy run does not exist." },
            },
            404,
          )
        : respond({ ok: true, run }, 200);
    } catch {
      return respond(
        {
          ok: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "The policy run could not be read.",
          },
        },
        500,
      );
    }
  };
}
