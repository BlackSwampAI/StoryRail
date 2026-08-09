import type {
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
  readonly apiKey: string;
  readonly fetch?: typeof globalThis.fetch;
}

export class FirecrawlSourceExtractorConfigurationError extends Error {
  readonly code = "FIRECRAWL_API_KEY_REQUIRED" as const;

  constructor() {
    super("A Firecrawl API key is required.");
    this.name = "FirecrawlSourceExtractorConfigurationError";
  }
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

function mapSuccessfulBody(body: unknown): SourceExtractorResult {
  if (!isRecord(body) || body.success !== true || !isRecord(body.data)) {
    return failure("EXTRACTION_FAILED", false);
  }

  const markdown = body.data.markdown;

  if (typeof markdown !== "string" || markdown.trim().length === 0) {
    return failure("EXTRACTION_FAILED", false);
  }

  const metadata = isRecord(body.data.metadata) ? body.data.metadata : null;
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
  if (options.apiKey.trim().length === 0) {
    throw new FirecrawlSourceExtractorConfigurationError();
  }

  const apiKey = options.apiKey;
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    descriptor: FIRECRAWL_DESCRIPTOR,
    async extract(source) {
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
            proxy: "basic",
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
