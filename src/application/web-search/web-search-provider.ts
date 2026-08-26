/**
 * One candidate page a search engine offered. It is not evidence and carries no identifier that
 * anything could cite: a snippet is a reason to go and read a page, and reading it is what
 * `fetch_url` does.
 */
export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
  /** Which engine offered it, when the instance says. Useful for judging, never for citing. */
  readonly engine: string | null;
}

export const WEB_SEARCH_FAILURE_CODES = [
  // The instance rejected the credentials it was sent.
  "SEARCH_CREDENTIALS_REJECTED",
  // The instance answered, but refuses to speak JSON. SearXNG does not enable the JSON format by
  // default, and an instance without `json` under `search.formats` answers 403 to every request
  // made this way — which reads exactly like an authorisation problem unless it is named.
  "SEARCH_JSON_FORMAT_DISABLED",
  // Nothing answered: a thrown fetch, a timeout, a name that does not resolve.
  "SEARCH_UNREACHABLE",
  // Something answered, and it was not a search result.
  "SEARCH_RESPONSE_INVALID",
] as const;

export type WebSearchFailureCode = (typeof WEB_SEARCH_FAILURE_CODES)[number];

export type WebSearchOutcome =
  | { readonly ok: true; readonly results: readonly WebSearchResult[] }
  | {
      readonly ok: false;
      readonly failure: {
        readonly code: WebSearchFailureCode;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

/**
 * Somewhere a newsroom can look for pages nobody handed it.
 *
 * A port rather than a client, because which engine a newsroom searches through is configuration:
 * the workflow knows only that it can ask a question and be given addresses.
 */
export interface WebSearchProvider {
  search(query: { readonly terms: string; readonly limit: number }): Promise<WebSearchOutcome>;
}
