import type {
  WebSearchOutcome,
  WebSearchProvider,
  WebSearchResult,
} from "@/application/web-search";
import type { SiteSearchSettings } from "@/domain/editorial";

/** How long one search may take before the Researcher is told nothing answered. */
export const SEARXNG_REQUEST_TIMEOUT_MS = 15_000;

export interface SearxngWebSearchOptions {
  readonly settings: SiteSearchSettings;
  /**
   * Whatever guards the instance. SearXNG has no authentication of its own, so this is the
   * password of the proxy in front of it, sent as the second half of an HTTP Basic header.
   */
  readonly password: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
}

/**
 * Search through a SearXNG instance.
 *
 * Every message this returns is a fixed string. Nothing caught, and nothing the instance said, is
 * interpolated into one — the request carries a Basic header, and a message assembled from a
 * thrown request or an echoed body is a message that can end up carrying the password into a
 * recorded tool call that is kept forever.
 */
export function createSearxngWebSearch(options: SearxngWebSearchOptions): WebSearchProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  const authorization = `Basic ${Buffer.from(`${options.settings.username}:${options.password}`, "utf8").toString("base64")}`;

  return {
    async search(query): Promise<WebSearchOutcome> {
      const endpoint = `${options.settings.baseUrl}/search?q=${encodeURIComponent(query.terms)}&format=json`;

      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authorization },
          signal: AbortSignal.timeout(options.timeoutMs ?? SEARXNG_REQUEST_TIMEOUT_MS),
        });
      } catch {
        return unreachable();
      }

      if (response.status === 401)
        return {
          ok: false,
          failure: {
            code: "SEARCH_CREDENTIALS_REJECTED",
            message:
              "The search instance rejected the credentials it was sent. Check the search username and the searxng_password credential.",
            retryable: false,
          },
        };

      // 403 is the one an operator loses an afternoon to. SearXNG ships without the JSON format
      // enabled, and an instance missing `json` under `search.formats` refuses this request in a
      // way that is indistinguishable from a rejected password unless it is named here.
      if (response.status === 403)
        return {
          ok: false,
          failure: {
            code: "SEARCH_JSON_FORMAT_DISABLED",
            message:
              "The search instance refused to answer in JSON. Add `json` to `search.formats` in its settings.yml and restart it.",
            retryable: false,
          },
        };

      if (!response.ok)
        return {
          ok: false,
          failure: {
            code: "SEARCH_UNREACHABLE",
            message: "The search instance answered with an error rather than results.",
            // A 5xx is a moment in an instance's life rather than a settled answer.
            retryable: response.status >= 500,
          },
        };

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return invalid();
      }

      if (typeof body !== "object" || body === null) return invalid();
      const answered = (body as { readonly results?: unknown }).results;
      if (!Array.isArray(answered)) return invalid();

      const results: WebSearchResult[] = [];
      for (const entry of answered) {
        if (typeof entry !== "object" || entry === null) continue;
        const candidate = entry as Record<string, unknown>;
        const url = candidate.url;
        if (typeof url !== "string" || url.trim().length === 0) continue;
        results.push({
          title: typeof candidate.title === "string" ? candidate.title.trim() : url,
          url: url.trim(),
          snippet: typeof candidate.content === "string" ? candidate.content : "",
          engine: typeof candidate.engine === "string" ? candidate.engine : null,
        });
        // Twenty come back from a live instance and the caller asked for a bounded number, so the
        // rest are dropped here rather than carried through the process to be sliced later.
        if (results.length >= query.limit) break;
      }

      return { ok: true, results };
    },
  };
}

function unreachable(): WebSearchOutcome {
  return {
    ok: false,
    failure: {
      code: "SEARCH_UNREACHABLE",
      message: "The search instance could not be reached.",
      retryable: true,
    },
  };
}

function invalid(): WebSearchOutcome {
  return {
    ok: false,
    failure: {
      code: "SEARCH_RESPONSE_INVALID",
      message: "The search instance answered with something that was not a list of results.",
      retryable: false,
    },
  };
}
