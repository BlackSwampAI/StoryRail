# ADR 0019: Durable Story inspection read model

- Date: 2026-08-09
- Status: Accepted

## Context

StoryRail durably preserves Stories, URL Sources, and immutable Source-to-Story attachments, but callers have no provider-neutral way to inspect those authoritative facts as one Story-centered result. Reading each repository separately would expose write-oriented boundaries, invite N+1 access, and leave missing-parent and ordering behavior undefined.

Story-Source attachments contain no editorial ordering fact. Their opaque timestamps must not be interpreted as chronology, priority, or database time.

## Decision

Introduce a provider-neutral `StoryInspectionRepository` with one `inspect(StoryId)` operation. Success returns the complete authoritative `Story` and a readonly collection in which every item keeps the complete authoritative `StorySourceAttachment` separate from its complete authoritative `UrlSource`. The read model creates no identity and replaces none of those domain facts. An existing unattached Story succeeds with an empty collection. A missing Story returns the stable expected `STORY_NOT_FOUND` result; it is neither nullable nor thrown as an expected application error.

The PostgreSQL adapter uses one read-only, parameterized left-join query over the Batch 0012, 0017, and 0018 tables. It strictly decodes relational columns and exact JSONB payloads, verifies identities across each joined relationship, and treats malformed facts or an impossible missing attached Source as one PostgreSQL Story-inspection persistence invariant failure. Query and connection failures remain unexpected failures.

Results use ascending `source_id` under PostgreSQL's `C` collation. This is deterministic technical ordering over an existing opaque identity only. It does not represent editorial chronology, priority, relevance, or attachment order. In particular, the adapter does not sort by attachment, Source, or Story timestamp strings.

No migration is required. The Batch 0018 composite primary key begins with `story_id`, so its existing access path supports Story-centered attachment lookup.

## Consequences

Application code can now request one durable Story-centered inspection without depending on PostgreSQL or coordinating separate repository calls. The operation is read-only, avoids N+1 access, preserves branded identities and opaque facts exactly, and gives unattached and missing Stories distinct stable outcomes.

This capability is not composed into runtime providers, environment configuration, HTTP, routes, authentication, queues, automation, or the newsroom UI. Existing fixture-backed newsroom Story views are unchanged.

## Rejected or deferred

- Inspection IDs, attachment IDs, persisted projections, or new migrations.
- Editorial ordering, chronology, priority, filtering, searching, listing, or pagination.
- Source-only, extraction-history, Article, Assignment, or global newsroom read models.
- Story or Source creation, preservation, extraction, attachment, transition, or other mutation during inspection.
- Runtime, server, HTTP, UI, fixture replacement, authentication, queues, jobs, and migration execution.
