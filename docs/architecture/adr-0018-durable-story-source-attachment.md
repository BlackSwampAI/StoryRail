# ADR 0018: Durable Source-to-Story attachment

- Date: 2026-08-09
- Status: Accepted

## Context

StoryRail can preserve and extract Source evidence and can create a durable Story, but those independent facts do not record an editorial decision that a particular Source is relevant to a particular Story. The MVP needs one explicit, attributable operation that connects two existing identities without collapsing Source into Story, creating either parent, or implying a state transition.

## Decision

A Story-Source attachment is an immutable relationship whose complete identity is the composite `(storyId, sourceId)` pair. It has no separate attachment ID. Its authoritative facts are the two parent identities, required relevance, the unchanged `EditorialActor` provenance, and one application-generated attachment time. The pure domain operation applies JavaScript leading-and-trailing whitespace trimming to relevance, rejects an empty trimmed value, preserves interior content exactly, copies the actor, and otherwise treats identities, actor facts, and time as opaque values.

The application workflow accepts only the existing Story identity, existing Source identity, relevance, and attaching actor. It obtains exactly one time before domain validation and delegates one valid attachment to the repository. Validation failure consumes that clock call and skips persistence. The workflow performs no parent reads: atomic parent existence and immutable relationship semantics belong to the repository.

The repository treats an exact complete replay for an existing pair as idempotent success. Any different relevance, actor fact, or attachment time for that pair is `STORY_SOURCE_CONFLICT`, and existing state is never overwritten. If no relationship exists, a missing Story produces `STORY_NOT_FOUND` before a missing Source is considered; when both are absent, Story therefore wins. If the Story exists but the Source does not, the result is `SOURCE_NOT_FOUND`.

PostgreSQL represents the relationship in `storyrail.story_source_attachments`, with the composite pair as its primary key, restrictive foreign keys to `stories` and `url_sources`, and one exact, constrained JSONB payload as the authoritative relationship. The adapter inserts by selecting both parents and uses `ON CONFLICT DO NOTHING`. A non-insertion is classified by reading the pair first, then Story existence, then Source existence. PostgreSQL uniqueness and conflict waiting make concurrent exact writes converge on one row and two successes; divergent writes preserve one winner and return one conflict after the loser observes the committed row. Strict decoding treats malformed, extra, missing, mismatched, empty, or untrimmed stored facts as one safe persistence invariant.

Attachment remains separate from Story creation and from Story transitions: it neither creates a Story nor changes Story state or `updatedAt`. It also remains separate from Source preservation and extraction: it neither creates, recanonicalizes, extracts, nor retries a Source.

## Consequences

StoryRail now has a durable, attributable Source-to-Story relationship behind pure domain, provider-neutral application, and replaceable persistence boundaries. Relationship writes are immutable, exact replays are safe, missing-parent outcomes are deterministic, and concurrent contenders cannot overwrite one another.

This capability is not connected to runtime composition, HTTP, the newsroom UI, fixtures, queues, automatic Story creation or attachment, or future lookup and listing operations. Those integrations and read models require separate decisions.

## Rejected or deferred

- Attachment IDs, ordering fields, replacement, update, detachment, or deletion.
- Story or Source creation, preservation, extraction, or transition work within attachment.
- Parent pre-reads, retries, advisory locks, or broader application transactions.
- Lookup, listing, filtering, pagination, or generic CRUD.
- Runtime, server, HTTP, UI, fixtures, queues, jobs, agents, providers, and migration execution.
