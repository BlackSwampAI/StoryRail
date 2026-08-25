import type { SiteId } from "@/domain/editorial";

import { siteApiPath } from "./site-paths";

/**
 * What the editor needs from a revision. The stored record also carries an identity and the
 * operator who wrote it; neither is shown, so neither is parsed here.
 */
export interface StandardsRevision {
  readonly revisionNumber: number;
  readonly text: string;
  readonly updatedAt: string;
}

export type ListStandardsResult =
  | { readonly kind: "loaded"; readonly revisions: readonly StandardsRevision[] }
  | { readonly kind: "unavailable" };

export type SaveStandardsResult =
  | { readonly kind: "saved"; readonly revision: StandardsRevision }
  | { readonly kind: "unavailable" };

export interface NewsroomStandardsClient {
  readonly listRevisions: () => Promise<ListStandardsResult>;
  readonly saveRevision: (text: string) => Promise<SaveStandardsResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRevision(value: unknown): value is StandardsRevision {
  return (
    isRecord(value) &&
    Number.isInteger(value.revisionNumber) &&
    typeof value.text === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function createNewsroomStandardsClient(dependencies: {
  readonly siteId: SiteId;
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): NewsroomStandardsClient {
  const api = (suffix: string) => siteApiPath(dependencies.siteId, suffix);
  return {
    async listRevisions() {
      try {
        const response = await dependencies.fetch(api("/newsroom-standards"), {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        if (!response.ok || !isRecord(body) || body.ok !== true || !Array.isArray(body.standards))
          return { kind: "unavailable" };
        return body.standards.every(isRevision)
          ? { kind: "loaded", revisions: body.standards }
          : { kind: "unavailable" };
      } catch {
        return { kind: "unavailable" };
      }
    },
    async saveRevision(text) {
      try {
        const response = await dependencies.fetch(api("/newsroom-standards"), {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ text }),
        });
        const body: unknown = await response.json();
        if (response.status !== 201 || !isRecord(body) || !isRevision(body.standards))
          return { kind: "unavailable" };
        return { kind: "saved", revision: body.standards };
      } catch {
        return { kind: "unavailable" };
      }
    },
  };
}
