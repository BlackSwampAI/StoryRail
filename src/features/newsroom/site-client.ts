import type { Site } from "@/domain/editorial";

export const SITE_REQUEST_UNAVAILABLE_MESSAGE = "The Site request could not be completed.";

export interface SiteClientError {
  readonly code: string;
  readonly message: string;
}

export type SiteClientResult<Value> =
  | { readonly kind: "completed"; readonly value: Value }
  | { readonly kind: "application-failure"; readonly error: SiteClientError }
  | { readonly kind: "unavailable"; readonly message: typeof SITE_REQUEST_UNAVAILABLE_MESSAGE };

export interface SiteClient {
  readonly listSites: () => Promise<SiteClientResult<readonly Site[]>>;
  readonly createSite: (command: {
    readonly name: string;
    readonly domain: string;
    readonly description: string;
  }) => Promise<SiteClientResult<Site>>;
}

const unavailable = (): SiteClientResult<never> => ({
  kind: "unavailable",
  message: SITE_REQUEST_UNAVAILABLE_MESSAGE,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSite(value: unknown): value is Site {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.domain === "string" &&
    typeof value.description === "string"
  );
}

function isError(value: unknown): value is SiteClientError {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

/**
 * The Site routes sit above every Site rather than inside one, so this client is the only one in
 * the newsroom that is not built from a Site.
 */
export function createSiteClient(dependencies: {
  readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): SiteClient {
  return {
    async listSites() {
      try {
        const response = await dependencies.fetch("/api/sites", {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        const body: unknown = await response.json();
        return response.status === 200 &&
          isRecord(body) &&
          body.ok === true &&
          Array.isArray(body.sites) &&
          body.sites.every(isSite)
          ? { kind: "completed", value: body.sites }
          : unavailable();
      } catch {
        return unavailable();
      }
    },
    async createSite(command) {
      try {
        const response = await dependencies.fetch("/api/sites", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(command),
        });
        const body: unknown = await response.json();
        if (!isRecord(body)) return unavailable();
        if (response.status === 201 && body.ok === true && isSite(body.site)) {
          return { kind: "completed", value: body.site };
        }
        if (
          response.status >= 400 &&
          response.status < 500 &&
          body.ok === false &&
          isError(body.error)
        ) {
          return { kind: "application-failure", error: body.error };
        }
        return unavailable();
      } catch {
        return unavailable();
      }
    },
  };
}

export const siteClient: SiteClient = createSiteClient({
  fetch: (input, init) => globalThis.fetch(input, init),
});
