# ADR 0012: PostgreSQL Source evidence persistence

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail has provider-neutral persistence ports and application workflows for preserving URL Sources and appending successful or expected-failure Source extraction facts. The reference repository proves the shared contract in memory for tests, but it is intentionally not production persistence. A concrete durable adapter is required without changing the existing domain, application, repository, or conformance boundaries and without wiring database ownership into the running application.

Source evidence has two independent uniqueness concerns: Source identity and canonical URL. Extraction attempts add identity uniqueness, restrictive Source references, and first-append ordering. Concurrent writers must not turn those rules into application-level check-then-insert races. The complete domain facts also contain opaque identifiers, exact timestamp strings, actors, extractor descriptors, nullable metadata, Markdown, and untrusted content that persistence must not normalize or interpret.

## Decision

PostgreSQL 18.4 is the first concrete Source-evidence persistence technology. The adapter uses `pg` 8.23.0, plain parameterized SQL, and one immutable forward migration. No ORM, query builder, migration framework, generated database client, hosted-database API, or simulated PostgreSQL implementation is introduced.

The migration creates the dedicated `storyrail` schema with exactly `url_sources` and `source_extractions`. Each row stores the complete domain value in an authoritative JSONB payload. Duplicate relational columns enforce Source identity uniqueness, canonical URL uniqueness, extraction identity uniqueness, Source reference integrity, outcome consistency, and deterministic append ordering. Domain identities and timestamps remain `text`; persistence does not assume UUID identities or normalize timestamp representations.

Database checks require object payloads and agreement between each payload's identity, Source reference, canonical URL, type, and outcome and the corresponding relational columns. Successful extraction payloads contain a document and no failure, while failed extraction payloads contain a failure and no document. The extraction foreign key uses restrictive update and delete behavior. A generated internal `append_position` and a `(source_id, append_position)` index support stable first-append listing without adding ordering metadata to the public domain or application contracts.

Repository writes use PostgreSQL-native constraints and `ON CONFLICT DO NOTHING`. Source persistence performs one insert attempt, then derives exact replay, Source-ID conflict, or canonical duplicate results through ordered follow-up reads. Extraction append performs one conditional `INSERT … SELECT` from the referenced Source, then derives exact replay, extraction-ID conflict, or missing-Source results through ordered follow-up reads. Complete reconstructed values are compared structurally, so JSON object key order is immaterial while every domain field and nested value remains meaningful.

All caller-controlled values are parameters. Schema and table names are fixed, schema-qualified adapter SQL and do not depend on `search_path`. Reads reconstruct fresh complete values, and lists return fresh collections ordered only by `append_position`. Corrupt or impossible persisted data rejects through a safe adapter-invariant error; connection, serialization, query, and other unexpected failures are not converted into expected editorial results or retries.

The adapter factory accepts an existing `pg` `Pool`. It does not construct or close the Pool, read environment variables, accept credentials, run migrations, expose transactions, or add runtime composition. Each write owns only its database operation and result derivation. No transaction spans provider or other network work, preserving the existing `load Source → perform one provider attempt → append the completed attempt` application sequence.

The existing repository conformance suite runs unchanged against the adapter. Additional integration tests use PostgreSQL itself to prove the migration, database constraints, complete fact round trips, safe failure boundaries, and concurrent uniqueness and append behavior. Test setup requires an explicitly configured database named exactly `storyrail_test` before it may drop the `storyrail` schema or truncate the two evidence tables.

## Consequences

StoryRail now has concrete durable Source-evidence persistence behind the existing provider-neutral repository interfaces. PostgreSQL, rather than agent memory or application pre-checks, enforces production uniqueness and referential integrity. Successful and failed extraction attempts receive equal append-only treatment, and concurrent operations preserve the approved conflict precedence.

The running application still does not construct a Pool or use this adapter. Runtime composition, credentials, deployment configuration, migration execution, and operational ownership remain deferred. Story and Article persistence, Source attachment, search, filtering, analytics, latest or best extraction selection, observability storage, queues, jobs, users, and credentials are outside this migration.

Contributors need a real PostgreSQL 18.4 `storyrail_test` database for the dedicated integration suite. Ordinary tests remain usable without a database by explicitly skipping the PostgreSQL suite when its test-only connection variable is absent.

## Alternatives considered

- **Promote the Batch 0010 reference repository to production:** Rejected; it remains a test-only executable specification and cannot provide durable or concurrent database guarantees.
- **Use an ORM, query builder, migration framework, or schema generator:** Rejected; the current boundary requires only two evidence tables and a small set of explicit PostgreSQL operations.
- **Use application-level uniqueness pre-checks:** Rejected; check-then-insert logic cannot enforce the required precedence under concurrent writers.
- **Store only normalized relational columns:** Rejected; normalization would expand the persistence model and risk losing exact complete domain facts.
- **Store only JSONB without relational constraints:** Rejected; PostgreSQL must independently enforce identity, canonical uniqueness, Source references, outcome consistency, and ordering.
- **Use UUID and timestamp database types:** Rejected; existing identities are opaque strings, and existing timestamps must round-trip without normalization.
- **Add JSONB search indexes or latest-attempt selection:** Deferred until concrete search and selection requirements exist.
- **Construct the Pool or run migrations inside the adapter:** Rejected; connection lifecycle, credentials, migration execution, and runtime composition belong to later boundaries.
- **Use testcontainers or an embedded PostgreSQL substitute:** Rejected; the integration suite must prove behavior against real PostgreSQL constraints and concurrency.
