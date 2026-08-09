# ADR 0017: Durable Story creation

- Date: 2026-08-09
- Status: Accepted

## Context

StoryRail already defines `Story` as the central editorial object and models its later state transitions, but Story creation has remained fixture-backed and disconnected from durable editorial state. Source evidence can be preserved and extracted independently; that does not establish a Story, attach evidence to one, or authorize an automatic editorial decision. The first durable Story boundary must therefore create one complete initial Story without coupling that decision to a provider, transport, runtime, Source workflow, or presentation model.

## Decision

The only caller-controlled creation fact is the title. The pure `createStory` domain operation trims leading and trailing whitespace, rejects an empty trimmed title, stores the trimmed value, and preserves all interior content and whitespace. It receives application-generated identity and time as opaque facts, fixes the initial state to `intake` and the revision cycle to `0`, and uses the single supplied time unchanged for both `createdAt` and `updatedAt`. No creation actor or provenance is inferred or stored.

A provider-neutral application workflow generates one Story ID, obtains one clock value, delegates validation and construction to the domain, and persists the complete Story. Expected title validation is returned without persistence. Persistence reports either the exact durable Story or an expected `STORY_ID_CONFLICT`; unexpected identity, clock, serialization, connection, query, and repository failures remain rejected failures.

The repository contract is immutable. A new identity stores the complete Story, an exact same-ID replay is idempotent success, and any different same-ID fact is a conflict that never overwrites the stored value. The reusable in-memory reference repository exists only for contract tests and is not runtime persistence or production composition.

PostgreSQL stores constrained `story_id`, `state`, and `revision_cycle` columns alongside an authoritative complete JSONB payload. Relational and payload constraints prove identity, state, revision-cycle, and required string-field agreement. The adapter strictly decodes the exact Story shape, privately loads a same-ID row only after a non-insert, and compares the complete decoded Story for replay equality.

Story creation remains separate from Source preservation and extraction. It neither attaches a Source nor creates a Story from Source intake. Source-to-Story attachment and later state transitions are separate editorial actions.

## Consequences

StoryRail has a durable Story creation capability behind pure domain, provider-neutral application, and replaceable persistence boundaries. Creation is deterministic apart from explicitly injected identity and time, while PostgreSQL protects immutable identity and exact replay semantics.

This capability has no HTTP endpoint, runtime or server composition, browser or newsroom connection, fixture replacement, queue connectivity, migration execution, agent invocation, actor, or provenance. Those integrations and later editorial operations require separate decisions.

## Rejected or deferred

- Summary, Source count, assignment, activity, presentation metadata, or creation receipts.
- Creation actors or provenance.
- Source preservation, extraction, attachment, or automatic Story creation from Source intake.
- Story lookup, listing, search, update, deletion, transitions, or queue queries.
- HTTP, runtime, server, browser, fixture, and queue connectivity.
- Agents, providers, retries, jobs, schedules, logging, and deployment behavior.
