# ADR 0008: Firecrawl Source extraction adapter

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

ADR 0007 defines provider-neutral Source extraction documents, failures, and immutable outcome recording in the editorial domain. StoryRail now needs its first executable extractor outside that pure domain boundary. The integration must retrieve an already-preserved URL Source without taking ownership of Source or SourceExtraction identity, provenance, timestamps, orchestration, or persistence.

Building and operating browser extraction infrastructure would delay the MVP. Firecrawl v2 provides hosted retrieval and Markdown extraction, but it introduces a paid hosted dependency whose request and response details must not become editorial-domain contracts. Retrieved Markdown, metadata, and provider responses are all untrusted input.

## Decision

Firecrawl v2 direct REST is the initial MVP Source extraction adapter. It is implemented behind a small, framework-independent `SourceExtractor` contract that exposes a stable descriptor and one asynchronous operation from an already-preserved `UrlSource` to either an `ExtractedSourceDocument` or a `SourceExtractionFailure`. A future local extractor can implement the same contract without changing the editorial domain.

The adapter descriptor is `firecrawl` version `v2`. The adapter sends exactly one `POST` request with built-in `fetch` to Firecrawl's fixed v2 scrape endpoint. Callers may inject a compatible fetch implementation, and all automated tests do so or safely spy on built-in fetch; tests never access the network. The integration uses direct REST rather than the Firecrawl SDK, so no SDK or other dependency is added.

Callers supply the Firecrawl credential directly when creating the adapter. The adapter does not read environment variables, accept arbitrary endpoints, or return credentials, headers, exceptions, response bodies, or provider diagnostics. Missing or whitespace-only credentials fail before retrieval as adapter configuration errors, not completed Source extraction failures.

Retrieval uses `source.canonicalUrl`; `source.submittedUrl` remains preserved evidence and is never substituted for the retrieval URL. The request asks for Markdown and main-content filtering while deliberately disabling LLM cleaning, acceptance of cached results, cache storage, TLS verification skipping, and automatic enhanced-proxy escalation. It uses basic proxy mode, removes base64 images, and blocks ads and cookie popups. The adapter makes one attempt only. It does not retry, inspect `Retry-After`, sleep, back off, or schedule work. Retry scheduling and `Retry-After` handling are deferred to a future application boundary.

Successful nonblank Firecrawl Markdown is preserved byte-for-byte as the normalized `markdown` document content. Trimming is used only to reject blank content. The adapter does not clean, sanitize, render, summarize, interpret, or execute Markdown, including HTML-like material and prompt-injection-like text. Only string-valued `metadata.title` and `metadata.language` are preserved; byline and publication time remain null because Firecrawl does not currently document stable typed fields for them. Unknown fields and provider internals are ignored.

Provider failures are reduced deterministically to the stable ADR 0007 taxonomy. Fetch exceptions become retryable retrieval failures. HTTP 408 and 504 become retryable retrieval timeouts; 429, 500, 502, and 503 become retryable retrieval failures; 413 becomes non-retryable content-too-large; 415 becomes non-retryable unsupported-content-type; all other unsuccessful statuses become non-retryable response rejection. Invalid successful responses become non-retryable extraction failures. Provider messages never refine classification or retryability.

The adapter owns neither Source identity nor SourceExtraction identity. It creates no actors, clocks, timestamps, records, logs, or persistence. Batch 0009 will provide extraction identity, actor provenance, and timestamps, then combine the adapter descriptor and result with `recordSourceExtraction`. That orchestration is intentionally absent here.

A manual paid Firecrawl smoke test will be designed and run separately by Chris after the mocked suite passes. It is not part of the automated test suite.

## Consequences

Firecrawl reduces the browser and extraction infrastructure needed for the first MVP path and provides Markdown directly. It also introduces a hosted dependency and per-request cost.

Direct REST avoids an SDK dependency and keeps the adapter boundary small, but StoryRail must maintain its own response guards and stable error translation as the provider evolves.

Basic proxy mode keeps billing predictable but may fail for sites requiring enhanced anti-bot support. The one-attempt policy exposes that failure as a provider-neutral fact for later orchestration rather than hiding extra cost or retries inside the adapter.

Byline and publication time remain null until a stable mapping is deliberately reviewed. This withholds potentially useful metadata but avoids guessing from arbitrary provider keys and making an accidental persistence contract.

Exact Markdown preservation retains useful structure and evidence fidelity, but downstream consumers must continue treating it as untrusted content.

## Alternatives considered

- **Use the Firecrawl SDK:** Rejected for the initial adapter because direct REST and built-in fetch avoid a production dependency. StoryRail accepts responsibility for request construction, response guards, and error translation.
- **Build a local browser extractor first:** Deferred because it adds substantial browser, parsing, and operational infrastructure before the MVP workflow is proven. A local implementation remains possible behind the same contract.
- **Allow automatic or enhanced proxy escalation:** Rejected because it makes request cost less predictable. Basic proxy failures remain explicit extraction facts.
- **Clean content with Firecrawl's LLM pass:** Rejected because the MVP needs deterministic HTML-level main-content filtering and exact provider Markdown, without another model transformation.
- **Map arbitrary author and publication metadata:** Rejected until stable, typed provider fields and editorial requirements support a deliberately reviewed mapping.
- **Retry inside the adapter:** Rejected because retries are separately attributable extraction attempts and future application orchestration must preserve each outcome.
