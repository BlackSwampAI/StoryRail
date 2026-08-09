# ADR 0007: Source extraction outcomes

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

ADR 0006 establishes Source identity before retrieval or extraction. StoryRail now needs a deterministic boundary for recording what happened when an already-preserved URL Source was submitted to an extraction mechanism. That boundary must preserve provenance and failed attempts without turning extraction into Source intake, Story formation, persistence, or network work.

An extraction attempt can fail for an expected operational reason and still be valuable durable evidence. That differs from an invalid command that lacks facts required to create a trustworthy record. Provider exceptions and request material may contain unstable, excessive, or sensitive data, so the durable domain record also needs a deliberately small failure vocabulary.

## Decision

StoryRail implements pure, framework-independent Source extraction outcome recording under `src/domain/editorial`. Source identity always precedes extraction. Each extraction is an immutable, attributable attempt associated with the preserved `SourceId` of one complete `UrlSource`; an extractor never creates, replaces, or recanonicalizes that identity.

Callers provide a distinct `SourceExtractionId`, the preserved `UrlSource`, a stable extractor key and version, the requesting `EditorialActor`, started and completed timestamps, and either a successful document or a structured failed outcome. The domain generates none of those facts and does not parse or order the timestamps. Each retry creates another extraction record rather than overwriting an earlier success or failure.

Both successful and failed extraction outcomes are durable records. A successful record contains a normalized document and no failure. A failed record contains a stable failure code and caller-supplied retryability decision and no document. The stable failure taxonomy is:

- `RETRIEVAL_FAILED`
- `RETRIEVAL_TIMED_OUT`
- `RESPONSE_REJECTED`
- `UNSUPPORTED_CONTENT_TYPE`
- `CONTENT_TOO_LARGE`
- `EXTRACTION_FAILED`

Durable failure records exclude arbitrary exception text, stack traces, response bodies, URLs, credentials, query strings, request headers, and provider error messages. Those values can leak secrets, reproduce hostile material, create unstable persistence contracts, and encourage callers to treat provider-specific diagnostics as domain facts. Operational observability may capture appropriately protected diagnostics outside this durable domain object.

The current successful-document boundary uses the exact format discriminator `markdown`, required Markdown content, and nullable title, byline, published timestamp, and language. Markdown is the normalized MVP extraction representation because it preserves useful editorial structure and source links. It is adapter-neutral even when a hosted adapter produces Markdown directly; future local extractors may instead parse article content and convert it into Markdown. The domain verifies only that the content is not blank and otherwise preserves it and all nullable metadata exactly.

Markdown and extracted metadata are stored and inspected as untrusted evidence, never instructions, even when they contain HTML-like material, commands, or prompt injection. The domain does not render, clean, sanitize, summarize, interpret, or otherwise transform Markdown.

Recording validates only the extractor key, extractor version, and required successful Markdown content. Empty or whitespace-only values produce the stable command-validation codes `SOURCE_EXTRACTOR_KEY_REQUIRED`, `SOURCE_EXTRACTOR_VERSION_REQUIRED`, and `EXTRACTED_SOURCE_CONTENT_REQUIRED`. An invalid recording command returns no extraction record. This is intentionally different from a valid command reporting a failed extraction outcome: the latter returns a durable failed attempt because its provenance and outcome are complete enough to retain.

Rendering, sanitization, raw-response preservation, raw HTML storage, DOM objects, binary data, content hashes, embeddings, storage references, and alternate extraction formats are deferred. The normalized Markdown document is sufficient to establish the pure recording contract without choosing presentation, artifact retention, comparison, or storage policies prematurely.

Networking, DNS, redirects, parsing, SSRF protection, response-size enforcement, and content-type enforcement belong to future extraction adapters and their application boundary. A future adapter will receive the already-preserved `UrlSource`, treat retrieved material as untrusted evidence, perform network and parsing work outside this pure domain, and translate its returned facts into the recording command. Extraction adapters receive and return facts but never create or own Source identity or extraction-record identity, and they never replace or recanonicalize a Source. The caller supplies a distinct extraction identity for every retry.

Retry scheduling, retry counts, delays, backoff, and selection of a current, best, or latest attempt are deferred. Future persistence must preserve every attempt using caller-supplied facts rather than overwrite prior records, and may order attempts without changing their contents.

Extraction neither creates a Story nor implies that the Source deserves coverage. It does not attach a Source to a Story or change Story state, and it does not add extraction lifecycle state to the Source.

## Consequences

Successful and failed extraction attempts become independently inspectable with Source, actor, extractor, identity, and timestamp provenance. Callers can retry after any outcome without losing earlier evidence. Frameworks, databases, queues, clocks, HTTP clients, parsers, and extraction providers remain outside the domain rule.

The small normalized-document and failure shapes intentionally omit potentially useful diagnostics and raw artifacts. Later adapter, observability, persistence, and retention decisions must define how those concerns are handled without broadening the durable domain record accidentally.

## Alternatives considered

- **Store extraction state on the Source:** Rejected because attempts are immutable events with their own identity and provenance, while a Source retains its identity regardless of extraction outcome.
- **Overwrite failed attempts during retry:** Rejected because it destroys operational and editorial provenance.
- **Treat failed extraction as command failure:** Rejected because a completed attempt with a failed operational outcome is valid evidence worth recording.
- **Persist arbitrary provider errors:** Rejected because they are unstable, provider-specific, and may disclose sensitive request or response material.
- **Retrieve or parse inside the domain function:** Rejected because network and parser behavior is effectful, replaceable, and subject to security controls outside a pure recording rule.
- **Create a Story after successful extraction:** Rejected because extraction quality does not decide editorial merit and a Source is not a Story.
- **Choose the latest or best extraction in this batch:** Deferred until persistence and product requirements define ordering and selection semantics.
