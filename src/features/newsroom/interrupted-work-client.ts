import type { SiteId } from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const INTERRUPTED_WORK_UNAVAILABLE_MESSAGE =
  "Interrupted work could not be recovered. Nothing is known to have changed.";

/** What one recovery pass closed. Every count is of work this request itself settled. */
export interface InterruptedWorkRecovery {
  readonly policyRuns: number;
  readonly agentRuns: number;
  readonly toolCalls: number;
  /**
   * Destination deliveries left in an unknown state. Each is one an operator still has to
   * reconcile against the destination, so they are named rather than merely counted.
   */
  readonly deliveries: readonly {
    readonly id: string;
    readonly storyId: string;
    readonly destination: string;
    readonly operation: "create" | "update";
    readonly slug: string;
  }[];
}

export type InterruptedWorkResult =
  | { readonly kind: "completed"; readonly recovery: InterruptedWorkRecovery }
  | { readonly kind: "unavailable"; readonly message: typeof INTERRUPTED_WORK_UNAVAILABLE_MESSAGE };

export interface InterruptedWorkClient {
  readonly recover: () => Promise<InterruptedWorkResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClosedDelivery(value: unknown): value is InterruptedWorkRecovery["deliveries"][number] {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.storyId === "string" &&
    typeof value.destination === "string" &&
    (value.operation === "create" || value.operation === "update") &&
    typeof value.slug === "string"
  );
}

const unavailable = (): InterruptedWorkResult => ({
  kind: "unavailable",
  message: INTERRUPTED_WORK_UNAVAILABLE_MESSAGE,
});

export function createInterruptedWorkClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): InterruptedWorkClient {
  return {
    async recover() {
      try {
        const response = await dependencies.fetch(
          siteApiPath(dependencies.siteId, "/reconciliation"),
          { method: "POST", headers: { Accept: "application/json" } },
        );
        const body: unknown = await response.json();
        if (
          !response.ok ||
          !isRecord(body) ||
          body.ok !== true ||
          !Array.isArray(body.abandonedPolicyRuns) ||
          !Array.isArray(body.abandonedAgentRuns) ||
          !Array.isArray(body.abandonedToolCalls) ||
          !Array.isArray(body.abandonedDeliveries) ||
          !body.abandonedDeliveries.every(isClosedDelivery)
        )
          return unavailable();
        return {
          kind: "completed",
          recovery: {
            policyRuns: body.abandonedPolicyRuns.length,
            agentRuns: body.abandonedAgentRuns.length,
            toolCalls: body.abandonedToolCalls.length,
            deliveries: body.abandonedDeliveries,
          },
        };
      } catch {
        return unavailable();
      }
    },
  };
}
