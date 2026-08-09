# ADR 0009: Source extraction application service

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

ADR 0007 defines immutable Source extraction outcomes and the pure `recordSourceExtraction` domain recorder. ADR 0008 defines the provider-neutral `SourceExtractor` adapter contract and its first Firecrawl implementation. An application boundary is required between them to coordinate attempt identity, actor provenance, timing, adapter execution, and domain recording without moving those responsibilities into either the provider adapter or the editorial domain.

The orchestrator must operate on an already-preserved `UrlSource`. It must preserve provider-neutral results and untrusted extracted Markdown exactly while keeping runtime composition concerns outside the service.

## Decision

StoryRail will provide a small, framework-independent Source extraction application service. Its command contains only the exact preserved `UrlSource` and a caller-supplied `EditorialActor`. Its dependencies are a provider-neutral `SourceExtractor`, a `SourceExtractionId` factory, and a clock returning timestamp strings. The service does not generate or infer actor provenance and does not use runtime-specific identity, time, credential, or environment mechanisms.

Each invocation coordinates exactly one attempt in this order: obtain one extraction ID, sample the clock once for `startedAt`, invoke `extractor.extract(source)` once, wait for it to fulfill, sample the clock once for `completedAt`, and call `recordSourceExtraction` once. It performs no retries.

For a fulfilled extractor success, the service passes the generated ID, exact Source, extractor descriptor, exact caller-supplied actor, exact timestamps, `outcome: "succeeded"`, and the exact returned document to the domain recorder. For a fulfilled expected failure, it passes the same provenance facts with `outcome: "failed"` and the exact returned failure. Successfully recorded failed attempts remain immutable, valid domain facts and are not overwritten by later invocations.

The service returns the domain recorder result unchanged, including validation failures. It does not reinterpret, normalize, trim, clone, sanitize, enrich, or otherwise reshape the Source, actor, descriptor, ID, timestamps, document, failure, or domain result. Extracted Markdown is untrusted evidence and is preserved exactly, including whitespace, Markdown structure, HTML-like material, and prompt-injection-like content.

If the extractor unexpectedly rejects rather than fulfilling its contract, the service propagates that rejection unchanged. It does not fabricate a domain failure, sample the completion clock, create a domain extraction record, or retry. Errors from the injected ID factory or clock likewise propagate without translation.

This application boundary adds no persistence, repositories, queueing, scheduling, logging, environment access, routes, server actions, UI, newsroom wiring, or Story creation. It does not attach a Source to a Story or change Story state.

Runtime composition remains deferred because this batch establishes only the portable orchestration contract; choosing concrete identity and clock implementations belongs at a later runtime boundary. Persistence remains deferred until repository and transaction boundaries are designed. UI wiring remains deferred until the application workflow can expose preserved Sources and recorded attempts without coupling the interface to an extraction provider.

## Consequences

The editorial domain and extraction adapters remain independently testable. Any `SourceExtractor` implementation can participate without changing the application service, while callers retain explicit responsibility for actor provenance and runtime composition.

One service invocation always corresponds to one attributable attempt. Expected provider failures become durable failed outcomes through the existing domain recorder, while contract-violating rejections remain visible to the caller and cannot be mistaken for classified editorial facts.

The service itself does not make extraction outcomes durable because persistence is not yet connected. A later application or runtime boundary must save successful domain records and expose them to operators without changing the orchestration semantics decided here.

## Alternatives considered

- **Orchestrate inside the Firecrawl adapter:** Rejected because identity, actor provenance, timing, and domain recording are provider-neutral application responsibilities.
- **Put extraction execution in the domain recorder:** Rejected because the domain must remain pure and must not perform asynchronous provider work or own runtime clocks and identity generators.
- **Translate rejected promises into domain failures:** Rejected because adapters already own expected provider classification; guessing would turn a contract violation into a misleading editorial fact.
- **Retry within the service:** Rejected because every retry is a distinct attributable attempt that requires an explicit invocation, identity, timestamps, and immutable outcome.
- **Add persistence or UI wiring now:** Deferred so repository, transaction, runtime composition, and operator-interface boundaries can be designed deliberately in later batches.
