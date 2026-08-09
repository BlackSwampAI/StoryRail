# ADR 0011: Source evidence application workflows

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail already has provider-neutral domain behavior for URL Source intake and extraction outcomes, a one-attempt extraction application service, and persistence ports for durable Source evidence. What is missing is the application-layer orchestration that connects those existing boundaries without moving editorial rules into repositories, adapters, routes, or runtime composition.

The orchestration must preserve the conflict precedence and atomicity defined by the persistence contracts. It must also avoid holding a database transaction open across provider work and must preserve expected failed extraction attempts as durable editorial facts.

## Decision

Source evidence orchestration belongs in the application boundary.

`preserveUrlSource` accepts only a submitted URL and caller-supplied actor. It obtains one injected Source identity and one injected timestamp, delegates Source construction and validation to `intakeUrlSource` with an empty existing-Source collection, and persists only a valid `UrlSource`. Intake failures prevent persistence.

Source uniqueness remains repository-owned and atomic. Preservation intentionally performs no canonical-URL or Source-identity pre-read and no application-owned uniqueness check. Avoiding a pre-read preserves the repository contract's precedence: exact Source-ID replay, then `SOURCE_ID_CONFLICT`, then canonical duplicate detection.

`extractPersistedSource` accepts a `SourceId`, not a caller-provided Source snapshot. It calls `UrlSourceRepository.findById` once and uses the returned complete `UrlSource` as authoritative. A missing Source returns the existing deterministic `SOURCE_NOT_FOUND` shape and blocks both provider invocation and append.

The existing `RunSourceExtraction` function is injected as the one-attempt collaborator. Batch 0009's identity, clock, provider, and domain-recording sequence remains unchanged. A domain recording failure prevents append. A valid successful extraction and a valid expected-failure extraction receive identical persistence treatment and are appended without interpretation or modification.

Append results, conflicts, exact replay behavior, Source-existence enforcement, and append ordering remain repository-owned. Exact replay does not create another stored attempt or ordering position. Each real retry is a new explicit workflow invocation that normally receives a new extraction ID; there is no command-level idempotency mechanism.

The approved boundary is `load Source → perform one extraction attempt → append the completed attempt`. No database transaction spans provider work, and the append repository owns only its atomic persistence operation.

Unexpected dependency failures propagate unchanged. They are never converted into editorial validation failures, persistence conflicts, provider failures, fabricated extraction attempts, or retry instructions. Submitted URLs, actors, Sources, extracted documents, failures, IDs, timestamps, and extractor descriptors remain uninterpreted and unmodified.

Runtime composition and concrete persistence remain deferred.

## Consequences

Application callers now have narrow provider-neutral workflows for preserving validated URL Sources and durably recording one extraction attempt against an authoritative persisted Source. Existing domain, extraction, and persistence contracts remain the owners of their respective rules.

The workflows neither guarantee an end-to-end runtime nor select storage, identity, clock, provider credentials, or interface wiring. If provider work completes and append unexpectedly rejects, the rejection propagates; the workflow does not claim that the attempt was persisted.

## Alternatives considered

- **Modify `intakeUrlSource`:** Rejected; existing domain construction and validation remain unchanged.
- **Modify `createRunSourceExtraction` or add repositories to it:** Rejected; Batch 0009's one-attempt orchestration remains unchanged and is injected here.
- **Accept a caller-provided Source snapshot during extraction:** Rejected; extraction must use the authoritative persisted Source.
- **Perform canonical or Source-identity pre-reads during preservation:** Rejected because application-owned uniqueness checks can invert repository conflict precedence and cannot provide atomic uniqueness.
- **Combine provider execution and persistence in one transaction:** Rejected; network work must not occur inside a database transaction.
- **Add command-level retry, idempotency, automatic retries, queues, scheduling, or backoff:** Deferred; each explicit invocation represents one attempt.
- **Choose concrete identities, clocks, credentials, or Firecrawl construction:** Deferred to runtime composition.
- **Choose Postgres, an ORM, schema, migrations, production adapters, or other concrete persistence:** Deferred.
- **Add runtime composition, routes, handlers, server actions, authentication, or newsroom UI wiring:** Deferred; the newsroom continues to use fixtures.
- **Add Story creation or Source attachment, Article behavior, pagination, filtering, or latest/best extraction selection:** Deferred beyond this seam.
- **Add observability storage:** Deferred to later operations design.
