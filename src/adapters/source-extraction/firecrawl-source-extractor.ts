import type {
  ApiKeyResolution,
  ExtractedSourceDocument,
  SourceExtractionFailure,
  SourceExtractorDescriptor,
} from "@/domain/editorial";

import type { SourceExtractor, SourceExtractorResult } from "./source-extractor";

const FIRECRAWL_SCRAPE_ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

const FIRECRAWL_DESCRIPTOR: SourceExtractorDescriptor = Object.freeze({
  key: "firecrawl",
  version: "v2",
});

export interface FirecrawlSourceExtractorOptions {
  /**
   * Resolved when a page is retrieved, never when the extractor is built. The runtime that owns
   * this extractor is cached for the life of the process, so a key read at construction could
   * only ever be replaced by a restart.
   */
  readonly resolveApiKey: () => Promise<ApiKeyResolution>;
  readonly fetch?: typeof globalThis.fetch;
}

function failure(code: SourceExtractionFailure["code"], retryable: boolean): SourceExtractorResult {
  return {
    ok: false,
    failure: { code, retryable },
  };
}

function mapHttpFailure(status: number): SourceExtractorResult {
  if (status === 408 || status === 504) {
    return failure("RETRIEVAL_TIMED_OUT", true);
  }

  if (status === 429 || status === 500 || status === 502 || status === 503) {
    return failure("RETRIEVAL_FAILED", true);
  }

  if (status === 413) {
    return failure("CONTENT_TOO_LARGE", false);
  }

  if (status === 415) {
    return failure("UNSUPPORTED_CONTENT_TYPE", false);
  }

  return failure("RESPONSE_REJECTED", false);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const CHALLENGE_PAGE_MARKERS = [
  /recaptcha\s+requires\s+verification/i,
  /protected\s+by\s+(?:\*\*)?recaptcha/i,
  /verify\s+you(?:'|’)re\s+human/i,
  /verify\s+you\s+are\s+human/i,
  /checking\s+your\s+browser/i,
  /challenge-platform/i,
] as const;

function isObviousChallengePage(markdown: string): boolean {
  return CHALLENGE_PAGE_MARKERS.some((marker) => marker.test(markdown));
}

// Firecrawl answers 200 with `success: true` even when the page it fetched answered with an
// error, reporting the upstream status in metadata. Rendering an error page as Markdown is not
// evidence, so the upstream status decides the outcome before any content is considered.
function upstreamFailure(metadata: Record<string, unknown> | null): SourceExtractorResult | null {
  const status = metadata?.statusCode;

  if (typeof status !== "number" || !Number.isInteger(status)) {
    return null;
  }

  return status >= 200 && status < 300 ? null : mapHttpFailure(status);
}

// A page that renders to almost nothing is an extraction artifact rather than an article. The
// floor is deliberately far below any real piece of writing so only empty shells are rejected.
const MINIMUM_EXTRACTED_CONTENT_LENGTH = 120;

function mapSuccessfulBody(body: unknown): SourceExtractorResult {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    return failure("EXTRACTION_FAILED", false);
  }

  const metadata = isRecord(body.data.metadata) ? body.data.metadata : null;
  const rejectedUpstream = upstreamFailure(metadata);

  if (rejectedUpstream) {
    return rejectedUpstream;
  }

  const markdown = body.data.markdown;

  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return failure("EXTRACTION_FAILED", false);
  }

  if (isObviousChallengePage(markdown)) {
    return failure("RESPONSE_REJECTED", false);
  }

  if (markdown.trim().length < MINIMUM_EXTRACTED_CONTENT_LENGTH) {
    return failure("EXTRACTION_FAILED", false);
  }

  const document: ExtractedSourceDocument = {
    format: "markdown",
    content: markdown,
    title: metadata && typeof metadata.title === "string" ? metadata.title : null,
    byline: null,
    publishedAt: null,
    language: metadata && typeof metadata.language === "string" ? metadata.language : null,
  };

  return { ok: true, document };
}

export function createFirecrawlSourceExtractor(
  options: FirecrawlSourceExtractorOptions,
): SourceExtractor {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    descriptor: FIRECRAWL_DESCRIPTOR,
    async extract(source) {
      // Asked for before anything else, so a newsroom with no key is told that rather than being
      // told the page could not be fetched. Nothing has been attempted at this point.
      const resolved = await options.resolveApiKey();
      if (!resolved.ok) return { ok: false, unavailable: resolved.error };
      const apiKey = resolved.apiKey;

      let response: Response;

      try {
        response = await fetchImplementation(FIRECRAWL_SCRAPE_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: source.canonicalUrl,
            formats: ["markdown"],
            onlyMainContent: true,
            onlyCleanContent: false,
            maxAge: 0,
            storeInCache: false,
            skipTlsVerification: false,
            proxy: "auto",
            removeBase64Images: true,
            blockAds: true,
          }),
        });
      } catch {
        return failure("RETRIEVAL_FAILED", true);
      }

      if (!response.ok) {
        return mapHttpFailure(response.status);
      }

      let body: unknown;

      try {
        body = await response.json();
      } catch {
        return failure("EXTRACTION_FAILED", false);
      }

      return mapSuccessfulBody(body);
    },
  };
}
