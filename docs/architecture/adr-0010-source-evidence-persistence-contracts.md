# ADR 0010: Source evidence persistence contracts

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail already defines provider-neutral `UrlSource` and `SourceExtraction` domain values and an application service that coordinates one extraction attempt. It now needs a durable evidence seam without selecting a database, framework, provider, or runtime composition.

Persistence ports belong in the application boundary rather than the pure editorial domain. The domain defines valid editorial facts; persistence coordinates atomic storage behavior, uniqueness, references, ordering, and infrastructure failures. Agent memory must not become the authoritative editorial store.

`SourceExtraction` references its Source through `SourceId`. It does not embed a complete Source value. A stable reference therefore depends on immutable, non-overwriting Source persistence and an existence check at extraction append time, not on duplicating a Source snapshot in either the extraction record or append command.

## Decision

StoryRail will expose separate, database-, framework-, and provider-neutral repositories for URL Sources and Source extractions. Existing `UrlSource` and `SourceExtraction` values remain the persisted editorial facts.

Source persistence atomically enforces both Source-ID and canonical-URL uniqueness. It first checks Source identity: an existing same-ID/same-value write is an idempotent success, while a same-ID/different-value write returns `SOURCE_ID_CONFLICT`. Only when the ID is unused does it check canonical uniqueness; a canonical URL already owned by another Source returns the existing `DuplicateSourceError`. Conflicts never overwrite stored state. There is no update, delete, mutable upsert, or generic CRUD operation, so a persisted Source ID remains an immutable reference.

Extraction persistence is append-only and requires an existing, immutable Source identified by `SourceExtraction.sourceId`. The Source and extraction repositories supplied by an implementation must share a consistent backing persistence context. A future concrete adapter must enforce Source existence atomically with extraction append. The persistence boundary does not duplicate the Source snapshot inside the extraction or append command, and it makes no claim that an extraction embeds a complete Source value.

Extraction append first checks extraction identity. An existing same-ID/same-value attempt is an idempotent success even if later existence checks would fail. A same-ID/different-value attempt returns `SOURCE_EXTRACTION_ID_CONFLICT`. Only a new extraction identity proceeds to Source-existence validation, which returns `SOURCE_NOT_FOUND` when the referenced Source is absent. Rejected conflicts and missing-Source attempts do not append, overwrite, or consume an ordering position.

Successful and expected-failure extraction attempts receive equal durability treatment. A real retry requires a new extraction ID and remains a separate attempt. Exact same-ID/same-value writes return the already stored logical value without generating an identity or timestamp, overwriting facts, duplicating a record, or changing its original position.

Minimal reads support Source lookup by ID and canonical URL, plus all extraction attempts for a Source. Missing Source lookups return `null`, while extraction lookup for an unknown Source returns an empty readonly collection. The ports do not select a current, latest, preferred, or best extraction.

Extraction lists use repository-assigned successful first-append order. This internal sequence is persistence metadata, not part of `SourceExtraction`, and is not derived from timestamps, extraction IDs, editorial chronology, or transaction commit order. Exact replays and rejected appends receive no new position.

Values crossing the persistence boundary have snapshot semantics. Implementations neither mutate caller-owned objects nor expose shared mutable stored objects. JavaScript reference identity is not guaranteed. Complete structural equality of every persisted field and nested logical value determines exact replay.

Expected conflicts expose stable structured errors and deterministic, safe messages without credentials, provider bodies, extracted Markdown, SQL, schema details, stack traces, or database diagnostics. Unexpected infrastructure failures reject their promises; they are not converted into expected conflicts, validation results, `SourceExtractionFailure` values, or fabricated attempts.

Each concrete write implementation owns the atomic storage operation necessary to uphold its contract. No generic transaction, callback transaction, unit of work, or network-spanning transaction is exposed.

A reusable conformance suite defines observable repository behavior using only the public ports and a factory for fresh repositories sharing one persistence context. Its test-only in-memory reference harness proves that the suite is executable and coherent; neither the suite nor the harness constitutes a production persistence implementation.

## Consequences

Future adapters can choose storage technology while preserving identical idempotency, conflict precedence, append ordering, reference integrity, and snapshot behavior. Application workflows can depend on narrow evidence-oriented ports without acquiring database or provider concerns.

The contracts do not make production persistence available. Postgres, ORM, query-builder, schema, migration, runtime composition, and credential decisions remain deferred. A production adapter must use storage-native atomicity and uniqueness guarantees; check-then-insert alone is not an adequate production uniqueness defense.

## Alternatives considered

- **Choose Postgres, an ORM, query builder, schema, or migrations now:** Deferred until a concrete persistence adapter is designed.
- **Provide a production in-memory or other concrete adapter:** Rejected because this batch defines contracts and conformance behavior only.
- **Use check-then-insert as the sole uniqueness defense:** Rejected because concurrent production writes require an atomic storage guarantee.
- **Duplicate the Source snapshot in an extraction or append command:** Rejected because `SourceId` is stable under immutable Source persistence and a duplicate representation could diverge.
- **Add update, delete, mutable upsert, or generic CRUD:** Rejected because durable evidence is immutable and the ports should express only required operations.
- **Expose transaction coordinators or units of work:** Rejected because each write owns its atomic operation and callers should not coordinate persistence internals.
- **Hold a database transaction across extraction network calls:** Rejected because provider work is outside the persistence operation.
- **Add runtime composition, credentials, routes, server actions, authentication, or UI:** Deferred to later runtime and interface work.
- **Persist Stories or Articles:** Deferred beyond this Source-evidence boundary.
- **Add pagination, search, filtering, or latest/best selection:** Deferred until concrete read requirements exist.
- **Add retries, queues, scheduling, or observability storage:** Deferred to later workflow and operations design.
