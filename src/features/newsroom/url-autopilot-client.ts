import type { PolicyRun, PolicyRunId, SiteId, SourceId } from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

export const URL_AUTOPILOT_UNAVAILABLE_MESSAGE = "The autopilot request could not be completed.";

export interface UrlAutopilotError {
  readonly code: string;
  readonly message: string;
}

export type UrlAutopilotStartResult =
  | {
      readonly kind: "started";
      /** Null where the installation records no policy runs; the sequence still runs. */
      readonly policyRunId: PolicyRunId | null;
      readonly sourceId: SourceId;
    }
  | { readonly kind: "refused"; readonly error: UrlAutopilotError }
  | { readonly kind: "unavailable"; readonly message: typeof URL_AUTOPILOT_UNAVAILABLE_MESSAGE };

export type UrlAutopilotFollowResult =
  { readonly kind: "observed"; readonly run: PolicyRun } | { readonly kind: "unavailable" };

export interface UrlAutopilotClient {
  readonly start: (command: {
    readonly submittedUrl: string;
    readonly research: boolean;
  }) => Promise<UrlAutopilotStartResult>;
  /**
   * Reads the policy run. A run started from a URL has no Story for its first minutes, so this
   * is what a watcher follows until there is one to follow instead.
   */
  readonly follow: (id: PolicyRunId) => Promise<UrlAutopilotFollowResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readError(body: unknown): UrlAutopilotError | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  return typeof code === "string" && typeof message === "string" ? { code, message } : null;
}

export function createUrlAutopilotClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): UrlAutopilotClient {
  return {
    async start(command): Promise<UrlAutopilotStartResult> {
      try {
        const response = await dependencies.fetch(siteApiPath(dependencies.siteId, "/autopilot"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            submittedUrl: command.submittedUrl,
            research: command.research,
          }),
        });
        const body: unknown = await response.json();
        if (response.status === 202 && isRecord(body) && typeof body.sourceId === "string") {
          return {
            kind: "started",
            policyRunId:
              typeof body.policyRunId === "string" ? (body.policyRunId as PolicyRunId) : null,
            sourceId: body.sourceId as SourceId,
          };
        }
        const error = readError(body);
        return error === null
          ? { kind: "unavailable", message: URL_AUTOPILOT_UNAVAILABLE_MESSAGE }
          : { kind: "refused", error };
      } catch {
        return { kind: "unavailable", message: URL_AUTOPILOT_UNAVAILABLE_MESSAGE };
      }
    },

    async follow(id): Promise<UrlAutopilotFollowResult> {
      try {
        const response = await dependencies.fetch(
          siteApiPath(dependencies.siteId, `/policy-runs/${encodeURIComponent(id)}`),
          { headers: { Accept: "application/json" } },
        );
        const body: unknown = await response.json();
        if (response.ok && isRecord(body) && isRecord(body.run))
          return { kind: "observed", run: body.run as unknown as PolicyRun };
        return { kind: "unavailable" };
      } catch {
        return { kind: "unavailable" };
      }
    },
  };
}
