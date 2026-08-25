import type { CreateSiteWorkflowResult } from "@/application/sites";
import type { SiteDirectoryRuntime } from "@/runtime";

const JSON_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const INVALID_JSON = {
  ok: false,
  error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." },
} as const;

const INVALID_REQUEST = {
  ok: false,
  error: {
    code: "INVALID_REQUEST",
    message: "The request body must contain exactly name, domain, and description.",
  },
} as const;

const UNSUPPORTED_MEDIA_TYPE = {
  ok: false,
  error: {
    code: "UNSUPPORTED_MEDIA_TYPE",
    message: "The request Content-Type must be application/json.",
  },
} as const;

const INTERNAL_SERVER_ERROR = {
  ok: false,
  error: { code: "INTERNAL_SERVER_ERROR", message: "The Site request could not be completed." },
} as const;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBody(
  value: unknown,
): value is { readonly name: string; readonly domain: string; readonly description: string } {
  return (
    isRecord(value) &&
    Object.keys(value).sort().join(",") === "description,domain,name" &&
    typeof value.name === "string" &&
    typeof value.domain === "string" &&
    typeof value.description === "string"
  );
}

// A domain already claimed by another Site is the operator's mistake to correct, not a defect, so
// it answers 409 with its own code rather than disappearing into a generic failure.
function statusFor(result: CreateSiteWorkflowResult): number {
  if (result.ok) return 201;
  return result.error.code === "SITE_DOMAIN_TAKEN" ? 409 : 422;
}

export function createListSitesHttpHandler(dependencies: {
  readonly getDirectory: () => SiteDirectoryRuntime;
}) {
  return async (): Promise<Response> => {
    try {
      return json({ ok: true, sites: await dependencies.getDirectory().listSites() }, 200);
    } catch {
      return json(INTERNAL_SERVER_ERROR, 500);
    }
  };
}

export function createCreateSiteHttpHandler(dependencies: {
  readonly getDirectory: () => SiteDirectoryRuntime;
  /** Lets the process skip a database round trip the first time the new Site is asked for. */
  readonly onSiteCreated?: (siteId: import("@/domain/editorial").SiteId) => void;
}) {
  return async (request: Request): Promise<Response> => {
    if (
      request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      return json(UNSUPPORTED_MEDIA_TYPE, 415);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json(INVALID_JSON, 400);
    }

    if (!isBody(body)) {
      return json(INVALID_REQUEST, 400);
    }

    try {
      const result = await dependencies.getDirectory().createSite(body);
      if (result.ok) {
        dependencies.onSiteCreated?.(result.site.id);
      }
      return json(result, statusFor(result));
    } catch {
      return json(INTERNAL_SERVER_ERROR, 500);
    }
  };
}
