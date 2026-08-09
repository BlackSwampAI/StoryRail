# ADR 0015: Source-evidence HTTP interface

- **Date:** 2026-08-09
- **Status:** Accepted

## Context

StoryRail has an existing combined application workflow that preserves one submitted URL Source and records one extraction attempt. Its server-only runtime composes that workflow with PostgreSQL persistence and the Firecrawl adapter, but no interface currently invokes it. The first interface must preserve the existing editorial, application, and infrastructure boundaries while providing stable transport semantics for a server-side caller.

Authentication and the newsroom URL-entry experience do not exist yet. This route is therefore a pre-production integration surface, not a publicly deployable mutation endpoint.

## Decision

The first Source-evidence interface is `POST /api/source-evidence/url`, implemented as a Next.js Route Handler that explicitly selects the Node.js runtime. It invokes only the existing combined preserve-and-extract workflow. Its JSON request accepts exactly one caller-controlled property, `submittedUrl`, whose string value passes unchanged to the application workflow. Transport media-type, JSON, and exact-shape validation remain in the HTTP interface; URL validation and canonicalization remain inside the existing domain and application boundaries.

Caller-supplied actors and identities are rejected. One fixed operator identity is loaded from the server-side `STORYRAIL_OPERATOR_ID` configuration after transport validation. The configured value is preserved exactly, converted with the existing `operatorId` helper, and used by the combined workflow as both Source submitter and extraction requester. This fixed single-operator provenance is not authentication.

Completed combined operations return HTTP `201` with the complete Source and durable extraction fact. A durable expected provider failure with extraction outcome `"failed"` is also a completed operation and returns `201`. Existing URL-validation failures return `422`; duplicate and Source-identity conflicts return `409`. Extraction-stage orchestration failures return `500` with the staged result, including the successfully preserved Source. No rollback or compensating deletion occurs. Unexpected configuration, runtime-acquisition, or workflow failures return one generic `500` response. Credentials, connection strings, exception details, and internal infrastructure are never returned. Every response is JSON with `Cache-Control: no-store`.

Runtime acquisition is lazy. One provider instance reuses one successfully constructed runtime and its one Pool. Provider construction and module import create no Pool. Invalid transport requests do not initialize the runtime or Pool, request completion does not close it, and failed runtime construction is not cached so a later request may retry construction. The production provider is module-scoped and process-local; separate server processes or isolates may each own a runtime and Pool. No framework shutdown hook is added. Graceful process shutdown and development hot-reload Pool lifecycle policy remain deferred.

The route remains separate from the newsroom client. It does not alter the existing runtime, application, domain, persistence, PostgreSQL, or extraction-adapter behavior.

## Consequences

A server-side caller can now submit one exact URL request and receive stable HTTP results for transport failures, preservation validation and conflicts, extraction-stage partial completion, and completed durable extraction facts. The shared runtime and Pool survive individual requests, avoiding per-request Pool creation and closure.

The route remains unauthenticated and must not be publicly exposed without access control. The newsroom does not call it, and Story and Article workflows remain outside this interface. StoryRail is still not an end-to-end operational or production-ready editorial system.

This record resolves the interface and lifecycle questions deferred by ADR 0013 and ADR 0014 only as far as this one route requires; it does not rewrite their historical decisions.

## Rejected or deferred

- **Caller-supplied `EditorialActor` values:** Rejected; fixed server configuration owns current provenance.
- **Caller-supplied Source or extraction identities:** Rejected; existing application and runtime boundaries retain identity ownership.
- **Per-request Pool creation or closing the runtime after every request:** Rejected; one provider instance reuses one successfully initialized runtime and Pool.
- **Browser-side runtime construction:** Rejected; infrastructure and credentials remain server-only.
- **Automatic retry, backoff, queues, scheduling, or command idempotency:** Deferred; one request invokes the combined workflow exactly once.
- **Treating duplicate preservation as success or automatically extracting an existing duplicate Source:** Rejected; existing preservation conflicts remain failures.
- **Rollback or compensating deletion:** Rejected; a Source preserved before an extraction-stage failure remains durable.
- **Authentication, authorization, accounts, sessions, and teams:** Deferred.
- **Public deployment of the unauthenticated mutation route:** Rejected until access control exists.
- **Newsroom form wiring and fixture replacement:** Deferred.
- **Story creation and Source attachment:** Deferred.
- **Article behavior and persistence:** Deferred.
- **Assignment, research, claims, drafting, review, revision, approval, publishing, and export workflows:** Deferred.
- **List, lookup, search, pagination, and latest-extraction endpoints:** Deferred.
- **Graceful shutdown and development hot-reload Pool policy:** Deferred.
- **Migration execution:** Rejected from this interface; migrations remain external.
- **Observability and deployment policy:** Deferred.
