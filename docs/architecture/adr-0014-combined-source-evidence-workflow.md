# ADR 0014: Combined Source evidence workflow

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail already has separate provider-neutral workflows for preserving a submitted URL Source and for loading an authoritative persisted Source, performing one extraction attempt, and appending its durable outcome. The server-only Source-evidence runtime composes and independently exposes both workflows. An interface will eventually need one application operation that performs those steps in order without duplicating their validation, identity, persistence, extraction, or conflict rules.

Preservation and provider extraction cannot be one atomic operation: preservation commits before provider work begins, and no database transaction may span a network request. The combined result therefore needs to distinguish which orchestration stage failed while retaining durable partial progress.

## Decision

Combined Source-evidence orchestration belongs in the application boundary. `PreserveAndExtractUrlSource` composes the existing `PreserveUrlSource` and `ExtractPersistedSource` workflows rather than duplicating or changing their rules.

The combined command accepts only a submitted URL and one `EditorialActor`. The same actor is the Source submitter and extraction requester. Source and extraction identities, timestamps, canonical URLs, Source snapshots, repositories, credentials, provider data, retry controls, runtime configuration, and transaction controls remain owned by the existing boundaries.

Preservation must complete before extraction begins. A preservation failure prevents extraction, including duplicate and Source-identity conflicts; those failures are not reinterpreted as success. After successful preservation, extraction receives the Source ID returned by preservation and the same actor as `requestedBy`. The existing extraction workflow then reloads the authoritative persisted Source.

A successful combined result contains the exact preserved Source and exact durable extraction record returned by the primitive workflows. A durable extraction record with outcome `"failed"` is an expected extraction fact and therefore represents a completed combined operation with `ok: true`. One combined invocation represents one explicit extraction attempt.

Preservation and extraction orchestration failures use explicit stage discrimination. A preservation-stage result contains the existing preservation error. An extraction-stage result contains both the already preserved Source and the existing extraction error. Existing error objects pass through unchanged. Unexpected throws or rejections also propagate unchanged.

A Source remains preserved when later provider or persistence work fails. The workflow attempts no rollback or compensating delete, and no transaction spans provider work. It adds no automatic retry, backoff, queue, scheduling, or command idempotency.

The server-only runtime exposes the combined workflow alongside both primitive workflows. It constructs the combined workflow from the exact primitive workflow instances already in its graph. Runtime construction remains inert, creates no additional Pool, repository, adapter, identity source, or clock, and does not change Pool ownership or closure behavior. Interface delivery remains separate from application orchestration.

## Consequences

Callers at a future server-side interface can request one explicit preserve-and-attempt sequence and receive both durable evidence facts when it completes. They can distinguish preservation failure from extraction orchestration failure and retain the preserved Source when only the later stage fails.

This resolves the combined-workflow question deferred by ADR 0011 and ADR 0013 without rewriting their historical decisions. It does not make StoryRail an end-to-end operational workflow or introduce an interface that invokes the runtime.

## Rejected or deferred

- **Treating duplicate preservation as success or automatically extracting an existing duplicate Source:** Rejected; duplicate and conflict results remain preservation failures.
- **Caller-supplied Source or extraction identities, timestamps, canonical URLs, or Source snapshots:** Rejected; existing identity, clock, intake, persistence, and extraction boundaries retain ownership.
- **Separate submitter and extraction-requester actors:** Deferred; one actor supplies both provenance roles in this workflow.
- **Rollback or deletion of a preserved Source:** Rejected; durable partial progress is retained.
- **Transactions across provider work:** Rejected; no database transaction may span network work.
- **Automatic retries, queues, scheduling, backoff, or command idempotency:** Deferred; one invocation remains one explicit attempt.
- **Routes, handlers, server actions, middleware, or authentication:** Deferred to interface and access-control work.
- **Newsroom fixture replacement or UI wiring:** Deferred; the newsroom continues to use fixtures.
- **Runtime singleton and framework lifecycle policy:** Deferred until an interface requires it.
- **Story creation and Source attachment:** Deferred beyond Source-evidence orchestration.
- **Article behavior or persistence:** Deferred.
- **Assignment, research, claims, drafting, review, revision, approval, or publishing workflows:** Deferred.
- **Latest or best extraction selection:** Deferred until selection semantics exist.
- **Pagination, filtering, or search:** Deferred until query requirements exist.
- **Observability, deployment, backup, or hosted-provider policy:** Deferred to operations and deployment design.
