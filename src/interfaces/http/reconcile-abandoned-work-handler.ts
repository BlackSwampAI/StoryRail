import type { StoryRuntime } from "@/runtime";
import { StoryRuntimeConfigurationError } from "@/runtime";

const HEADERS = { "Cache-Control": "no-store", "Content-Type": "application/json" } as const;
const respond = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

/**
 * Closes out work whose process disappeared. Exposed as an explicit action rather than run on a
 * timer inside the application, because when reconciliation happens is an operational decision:
 * a deployment can schedule it, and a person can ask for it after a crash.
 */
export function createReconcileAbandonedWorkHttpHandler(dependencies: {
  readonly getRuntime: () => StoryRuntime;
}) {
  return async (): Promise<Response> => {
    try {
      const report = await dependencies.getRuntime().reconcileAbandonedWork();
      return respond(
        {
          ok: true,
          abandonedPolicyRuns: report.abandonedPolicyRuns.map((run) => ({
            id: run.id,
            storyId: run.storyId,
            step: run.step,
          })),
          abandonedAgentRuns: report.abandonedAgentRuns.map((run) => ({
            id: run.id,
            storyId: run.storyId,
            role: run.role,
            operation: run.operation,
          })),
        },
        200,
      );
    } catch (caught) {
      if (caught instanceof StoryRuntimeConfigurationError)
        return respond(
          { ok: false, error: { code: "RECONCILIATION_UNAVAILABLE", message: "Not configured." } },
          503,
        );
      return respond(
        {
          ok: false,
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Reconciliation could not be completed.",
          },
        },
        500,
      );
    }
  };
}
