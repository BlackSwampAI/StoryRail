# ADR 0016: Newsroom Source-evidence URL intake

- Date: 2026-08-09
- Status: Accepted

## Context

Batch 0015 exposed the combined preserve-and-extract workflow through `POST /api/source-evidence/url`, but the fixture-backed newsroom did not invoke it. Operators therefore had no browser interface for submitting one URL or inspecting the resulting Source and extraction receipt. The first operator-usable vertical slice must connect that existing interface without confusing Source intake with Story selection or moving server-owned provenance and domain validation into the browser.

## Decision

The newsroom gains a separate **Source intake** workspace alongside Story and Assistant. Story remains the initial workspace. Source intake is not part of a selected Story workspace, does not change the selected Story or queue, and does not create or mutate a Story. Source attachment remains an explicit future workflow. Story fixtures remain authoritative for the presentation prototype.

The form sends exactly one caller-controlled field, `submittedUrl`, to only `POST /api/source-evidence/url`. The exact submitted string reaches the existing route unchanged. Browser validation does not duplicate editorial URL validation or canonicalization. One explicit submission produces exactly one request, and the client performs no automatic retry.

The browser client validates the response structure needed by the interface and distinguishes completed operations, preservation-validation failures, preservation conflicts, extraction-stage partial completion, stable interface failures, generic internal failures, and unavailable responses. Recognized Source, extraction, and application-error facts are preserved without editorial reinterpretation. Unrecognized, malformed, unexpected, or unavailable responses fail closed to one safe client message.

A durable expected provider failure remains a completed operation with its complete Source and failed extraction fact. An extraction-stage application failure is partial completion: the preserved Source remains visible alongside the stage and application error. Extracted Markdown is rendered as escaped plain text in a bounded preview, never as trusted HTML.

The form state, pending operation, and latest receipt remain mounted while the operator switches workspaces, but are transient to the current page session. They are not written to browser persistence and cannot be reconstructed after reload.

Fixed operator provenance remains server-owned. It is not authentication. The mutation route remains unsuitable for public deployment. This decision consumes the Batch 0015 interface without changing the existing runtime, Pool, application, domain, persistence, adapter, or route behavior.

## Consequences

An operator can preserve one URL, attempt extraction, and inspect the complete immediate receipt without implying that one URL is one Story. Completed provider failures, preservation failures, partial completion, interface failures, and unavailable responses remain visibly distinct. Later Source inspection still requires a durable listing or lookup interface.

## Rejected or deferred

- Client-supplied actors or identities.
- Client-side URL validation or canonicalization.
- Automatic Story creation, automatic Source-to-Story attachment, or treating one URL as one Story.
- Fixture replacement.
- Source listing, lookup, search, pagination, or inspection, including latest-extraction lookup.
- Retry, backoff, queues, polling, scheduling, or command idempotency.
- Rendering extracted content as trusted HTML or presenting raw JSON.
- Local storage, session storage, cookies, IndexedDB, URL parameters, or other local client persistence.
- Authentication, authorization, accounts, sessions, and teams.
- Public deployment.
- Story and Article persistence and broader editorial workflows.
- Migration execution.
- Graceful shutdown and hot-reload Pool policy.
- Observability and deployment policy.
