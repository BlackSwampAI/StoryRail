import { siteId, type SiteId } from "@/domain/editorial";

import { siteDirectoryProvider, type SiteDirectoryProvider } from "./site-directory-provider";

export interface SiteRouteParameters {
  readonly siteId: string;
}

export interface SiteRouteContext {
  readonly params: Promise<SiteRouteParameters>;
}

export type SiteRouteHandler<TContext> = (
  request: Request,
  context: TContext,
) => Promise<Response> | Response;

const JSON_RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
} as const;

const SITE_NOT_FOUND_RESPONSE = Object.freeze({
  ok: false,
  error: Object.freeze({
    code: "SITE_NOT_FOUND",
    message: "No Site with that identifier exists.",
  }),
});

/**
 * Refuse a request for a Site that does not exist before anything is built for it.
 *
 * The runtime providers are keyed by whatever identifier arrives in the path, and a runtime owns
 * a connection pool, so without this check a stranger could vary the path and make the process
 * build pools until it fell over. Checking existence first means every key in those caches is a
 * Site the installation really has.
 */
export function withSite<TContext>(
  handlerFor: (site: SiteId) => SiteRouteHandler<TContext>,
  directory: SiteDirectoryProvider = siteDirectoryProvider,
): (request: Request, context: TContext & SiteRouteContext) => Promise<Response> {
  return async (request, context) => {
    const parameters = await context.params;
    const site = siteId(parameters.siteId);

    if (!(await directory.exists(site))) {
      return new Response(JSON.stringify(SITE_NOT_FOUND_RESPONSE), {
        status: 404,
        headers: JSON_RESPONSE_HEADERS,
      });
    }

    return handlerFor(site)(request, context);
  };
}
