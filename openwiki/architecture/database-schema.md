---
type: Reference
title: PostgreSQL schema and migrations
description: StoryRail storyrail schema migrations for Sources, raw and prepared evidence, Stories, attachments, and triage decisions, with JSONB payload integrity constraints.
tags: [database, postgresql, schema, migrations]
---

# PostgreSQL schema and migrations

StoryRail persists editorial state in a `storyrail` schema in PostgreSQL. Migrations live in `database/migrations/` as numbered `.sql` files. The application runtime does **not** execute migrations; they must be applied externally before a composed runtime can persist Source evidence or Story state.

PostgreSQL is intended to be authoritative for editorial state; agent memory must never become the database. All tables store a JSONB `payload` (the serialized domain object) alongside denormalized relational columns, and enforce that the payload matches those columns with `CHECK` constraints. This keeps the domain object authoritative while allowing relational queries and integrity.

## Migration 0012 — source evidence

`database/migrations/0012-source-evidence.sql` creates the `storyrail` schema and two tables.

### storyrail.url_sources

| Column          | Type    | Notes                                    |
| --------------- | ------- | ---------------------------------------- |
| `source_id`     | text PK |                                          |
| `canonical_url` | text    | unique (`url_sources_canonical_url_key`) |
| `payload`       | jsonb   | the serialized `UrlSource`               |

Constraints ensure the payload is an object whose `id` = `source_id`, `canonicalUrl` = `canonical_url`, and `type` = `'url'`. The unique `canonical_url` enforces exact-URL duplicate prevention at the database level.

### storyrail.source_extractions

| Column            | Type    | Notes                                                  |
| ----------------- | ------- | ------------------------------------------------------ |
| `extraction_id`   | text PK |                                                        |
| `source_id`       | text    | FK → `url_sources`, `ON UPDATE/DELETE RESTRICT`        |
| `outcome`         | text    | `CHECK` in (`'succeeded'`, `'failed'`)                 |
| `payload`         | jsonb   | the serialized `SourceExtraction`                      |
| `append_position` | bigint  | `GENERATED ALWAYS AS IDENTITY`, preserves append order |

Constraints ensure payload `id` = `extraction_id`, `sourceId` = `source_id`, `outcome` matches, and a `succeeded` outcome has `document` (and no `failure`) while a `failed` outcome has `failure` (and no `document`). The identity `append_position` preserves the order of extraction attempts so retries are retained in sequence.

## Migration 0017 — durable Story creation

`database/migrations/0017-durable-story-creation.sql` creates `storyrail.stories`.

| Column           | Type    | Notes                               |
| ---------------- | ------- | ----------------------------------- |
| `story_id`       | text PK |                                     |
| `state`          | text    | `CHECK` in the eight `STORY_STATES` |
| `revision_cycle` | integer | `CHECK` between 0 and 2             |
| `payload`        | jsonb   | the serialized `Story`              |

Payload constraints ensure `id` = `story_id`, `state` matches, `revisionCycle` matches (including integer/text equality), and `title`, `createdAt`, `updatedAt` are present strings. The `revision_cycle` check mirrors the domain `MAX_REVISION_CYCLES = 2`.

## Migration 0018 — durable Story-Source attachment

`database/migrations/0018-durable-story-source-attachment.sql` creates `storyrail.story_source_attachments` with a composite primary key `(story_id, source_id)`.

- Foreign keys to `stories` and `url_sources`, both `ON UPDATE/DELETE RESTRICT` — a Story or Source cannot be deleted while an attachment references it.
- A `payload_shape_check` constraint reconstructs the payload from exactly its five fields (`storyId`, `sourceId`, `relevance`, `attachedBy`, `attachedAt`), rejecting extra or missing keys.
- Payload/column consistency checks for `storyId`, `sourceId`, `relevance`, `attachedAt`, and a discriminated `attachedBy` object (operator or agent with a bounded role).

## Migration 0024 — source triage decisions

`database/migrations/0024-source-triage-decisions.sql` creates `storyrail.source_triage_decisions`.

| Column      | Type    | Notes                                                          |
| ----------- | ------- | -------------------------------------------------------------- |
| `source_id` | text PK | FK → `url_sources`                                             |
| `decision`  | text    | `CHECK` in (`'new_story'`, `'existing_story'`, `'skip'`)       |
| `story_id`  | text    | nullable; FK → `story_source_attachments(story_id, source_id)` |
| `payload`   | jsonb   | the serialized `SourceTriageDecision`                          |

Key constraints:

- `story_shape_check`: `skip` requires `story_id IS NULL`; `new_story`/`existing_story` require `story_id IS NOT NULL` — mirroring the domain `decideSourceTriage` rules.
- The `story_id` foreign key references the **attachment** composite key, so a `new_story`/`existing_story` triage decision requires a pre-existing Story-Source attachment (the `STORY_SOURCE_ATTACHMENT_NOT_FOUND` error path).
- `payload_reason_check` requires the reason be a non-empty, trimmed string.
- `payload_decided_by_check` validates the operator/agent actor shape with bounded agent roles.
- One row per `source_id` (PK) enforces a single final triage decision per Source (the `SOURCE_TRIAGE_CONFLICT` path).

## Migration 0025 — prepared evidence

`database/migrations/0025-source-evidence-preparations.sql` creates append-only `storyrail.source_evidence_preparations`. Each row references the exact `(extraction_id, source_id)` raw extraction, records a succeeded or failed preparation payload, and receives an identity `append_position`. Database constraints keep the relational identity, outcome, and serialized domain payload consistent. Prepared Evidence is derived history and never replaces `source_extractions`.

## Migration 0027 — agent profiles

`database/migrations/0027-agent-profiles.sql` creates `storyrail.agent_profiles` and seeds three built-in profiles: `storyrail-assignment-editor-v1`, `storyrail-general-writer-v1`, and `storyrail-director-v1`. A profile stores `profile_id`, `role` (`assignment_editor`, `writer`, `editor_in_chief`), `built_in`, and a JSONB `payload` whose exact shape is `{ id, role, name, instructions, model, builtIn }`. The `agent_profiles_custom_writer_check` constraint enforces that a non-built-in profile must be a Writer. `model` is either `null` (use the runtime default) or an exact `{ provider, model }` object. Built-in profiles carry curated, immutable instructions and a `null` model.

## Migration 0028 — durable assignments and transition receipts

`database/migrations/0028-durable-assignments.sql` adds a composite unique key `(profile_id, role)` to `agent_profiles` and creates two tables.

`storyrail.story_assignments` has `assignment_id` as primary key, a `story_id` that is unique and foreign-keyed to `stories` (one Assignment per Story), and a `writer_profile_id`/`writer_role` pair foreign-keyed to `agent_profiles`. The payload shape is `{ id, storyId, writerProfileId, sourceIds, angle, brief, constraints, assignedBy, assignedAt }`. `sourceIds` must be a unique array of non-empty strings; `angle` and `brief` are trimmed non-empty strings; `constraints` is null or a trimmed non-empty string; `assignedBy` is an operator or an `assignment_editor` agent actor.

`storyrail.story_transition_receipts` is append-only with an identity `append_position`, foreign-keyed to `stories`. Its payload is the full `StoryTransitionReceipt` and must be consistent with the denormalized `previous_state`, `next_state`, and `revision_cycle` columns. An index on `(story_id, append_position)` supports ordered transition history reads.

A helper function `storyrail.jsonb_text_array_has_unique_items` validates unique string arrays.

## Migration 0030 — agent runs (Assignment Editor)

`database/migrations/0030-agent-runs.sql` creates `storyrail.agent_runs` and several validation helper functions. Initially the table supports only `role = 'assignment_editor'` with `operation = 'assignment_proposal'`. Each row records `run_id`, `story_id`, `profile_id`, `role`, `operation`, `outcome`, an identity `append_position`, and a JSONB `payload` whose shape depends on the role/operation/outcome. The `input` payload captures the exact Story snapshot, the selected `EvidenceReference[]` (each `{ sourceId, relevance, evidenceKind: 'prepared'|'raw', evidenceId }`), the `unavailableSourceIds`, and the `writerProfileIds` candidates. A succeeded run carries a `proposal` validated against the supplied writer candidates; a failed run carries a `{ code, retryable }` failure with a bounded `MODEL_*` code. Helper functions enforce evidence/source disjointness and unique text arrays.

## Migration 0031 — articles, writer drafts, and Writer agent runs

`database/migrations/0031-articles-and-writer-drafts.sql` extends `agent_runs` to support `role = 'writer'` with `operation = 'article_draft'` and creates the Article tables.

The `agent_runs` constraints are rewritten so a Writer run's `input` carries the full `assignment` snapshot, and its evidence/unavailable sets must exactly partition the assignment's `sourceIds` (validated by `storyrail.writer_run_source_snapshot_is_valid`). A succeeded Writer run carries `articleId` and `revisionId`; a failed run carries the same `{ code, retryable }` failure shape. A new unique key `(run_id, profile_id, role, outcome)` lets an Article Revision reference the exact succeeded Writer run.

`storyrail.articles` has `article_id` as primary key, a unique `story_id` (one Article per Story), and a unique `assignment_id` foreign-keyed to `story_assignments`. `storyrail.article_revisions` is append-only with an identity `append_position`, a unique `(article_id, revision_number)`, and a `revision_number = 1` check (only the first revision is implemented). Each revision is foreign-keyed to a succeeded Writer `agent_run` and a Writer `agent_profile`, and its `createdBy` must be the agent actor for that run. The payload carries `headline`, nullable `dek`, and `bodyMarkdown`.

## Integration test lifecycle

The PostgreSQL integration tests (`src/adapters/source-persistence/postgres-source-repositories.test.ts` and the Story/attachment/assignment/run/article contracts) connect via `STORYRAIL_TEST_DATABASE_URL`, verify the database name is exactly `storyrail_test`, drop and recreate the `storyrail` schema, apply migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, and `0031` in order, and truncate the editorial tables (plus delete non-built-in Agent Profiles) between cases. The suite never creates or drops a database.
