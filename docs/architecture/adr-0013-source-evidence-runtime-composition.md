# ADR 0013: Source evidence runtime composition

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail has provider-neutral Source-evidence workflows, a Firecrawl v2 extraction adapter, and PostgreSQL repositories that accept but do not own a `pg.Pool`. Those pieces need a concrete server-side composition boundary before a later interface can invoke them. That boundary must select production identities, time, credentials, and lifecycle ownership without moving editorial rules into runtime code or making construction perform external work.

Runtime composition is distinct from interface delivery and deployment policy. It must remain possible to construct the graph deterministically in isolated unit tests without a database, provider request, credential exposure, or framework lifecycle.

## Decision

Source-evidence runtime composition is a server-only boundary. It is not exported through a browser-reachable barrel and is not invoked by a route, handler, server action, middleware, newsroom component, or other interface.

Runtime configuration reads exactly `STORYRAIL_DATABASE_URL` and `FIRECRAWL_API_KEY`. Both are required. Configuration errors use stable codes that identify the missing variable without including its value, raw environment data, SQL, or diagnostics. Configuration loading preserves nonblank values exactly and performs no provider or database work.

Each runtime instance creates and owns exactly one `pg.Pool`, supplying only the configured connection string. The existing PostgreSQL adapter remains non-owning. The runtime exposes explicit idempotent closure and ends its own Pool no more than once. PostgreSQL SSL, pool size, idle timeout, retry, replica, hosted-provider, singleton, and framework lifecycle-caching policies remain deferred.

Runtime construction creates objects only. It does not connect or query PostgreSQL, run migrations, or invoke Firecrawl. Migration execution and schema-history management remain external to application runtime.

`node:crypto` `randomUUID` supplies concrete opaque Source and Source-extraction identity strings. The existing `sourceId` and `sourceExtractionId` helpers convert those strings to the established branded application types without adding another format or prefix. ISO strings from `new Date().toISOString()` provide the concrete clock. One clock function is shared across preservation and extraction composition.

Firecrawl v2 remains the selected replaceable extraction adapter. The runtime supplies it with the configured API key and selected fetch implementation. It composes the existing `RunSourceExtraction`, `PreserveUrlSource`, and `ExtractPersistedSource` factories unchanged. One PostgreSQL repository factory call creates the Source and extraction repository instances, and those same instances are shared throughout the graph. No workflow behavior is duplicated in runtime composition, and no transaction spans Firecrawl or application orchestration.

The runtime exposes only `preserveUrlSource`, `extractPersistedSource`, and explicit closure. It does not expose repositories, the Pool, credentials, configuration, internal dependency graphs, or transaction controls. Deterministic fetch, clock, UUID, and Pool-factory overrides exist only as isolated testing seams and cannot bypass the established domain, application, repository, or adapter contracts.

## Consequences

StoryRail can now construct the existing PostgreSQL, Firecrawl, and Source-evidence application stack behind one narrow server-only runtime surface. Every preservation and extraction invocation receives fresh concrete identities as required, while the shared clock and repositories preserve the existing application sequence and conflict behavior.

This decision does not make the editorial workflow end to end, deployed, or production-ready. A later interface and deployment design must decide when and how to construct and close runtimes, apply migrations externally, and invoke the exposed workflows.

## Rejected or deferred

- **Browser or client-side runtime composition:** Rejected; credentials and infrastructure ownership remain server-only.
- **Routes, handlers, server actions, middleware, or authentication:** Deferred to interface and access-control batches.
- **Newsroom fixture replacement or UI wiring:** Deferred; the newsroom continues to use fixtures.
- **A combined preserve-and-extract workflow:** Deferred; the two existing workflows remain independently exposed.
- **Story creation, Source attachment, or Article behavior and persistence:** Deferred beyond Source-evidence composition.
- **Pool singletons or framework lifecycle caching:** Deferred until an interface and framework lifecycle require a policy.
- **SSL, pool-size, timeout, replica, or hosted-provider policy:** Deferred to deployment design.
- **Migration execution or schema-history management:** Rejected from application runtime; migrations remain external.
- **Storing credentials in PostgreSQL:** Rejected; credentials remain runtime configuration.
- **Exposing configuration or credentials through runtime results:** Rejected.
- **Automatic retries, queues, scheduling, backoff, or command idempotency:** Deferred; an invocation remains one explicit attempt.
- **Transactions across provider work:** Rejected; no transaction may span Firecrawl or other network work.
- **Observability storage:** Deferred to later operations design.
- **Deployment and backup configuration:** Deferred.
- **Latest or best extraction selection:** Deferred until selection semantics exist.
- **Pagination, filtering, or search:** Deferred until query requirements exist.
