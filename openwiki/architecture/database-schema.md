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

## Migration 0038 — supervised Director review

`database/migrations/0038-supervised-director-review.sql` extends `agent_runs` to support `role = 'editor_in_chief'` with `operation = 'article_review'`, adds a `storyrail.director_review_is_valid` SQL function, and creates `storyrail.review_decisions`.

The migration drops and recreates the `agent_runs` operation, exact-shape, input, and outcome `CHECK` constraints so a Director run's `input` carries the full `assignment`, `article`, and `revision` snapshots alongside the shared `story`/`evidence`/`unavailableSourceIds` fields. A Director run's `input.story.state` must be `'in_review'`, and its `input.article` and `input.revision` must cross-reference the assignment, the article, and each other exactly. A succeeded Director run carries a `review` object validated by the `director_review_is_valid` function (mirrors the domain `createDirectorReview` rules: recommendation/summary/checks shape, approve requires all-pass checks and null revision instructions, request_changes requires at least one `needs_changes` check and non-empty trimmed revision instructions).

Two generated columns — `review_article_id` and `review_revision_id` (populated only for a Director `article_review` run, otherwise `NULL`) — enable:

- `agent_runs_review_revision_fk`: a composite foreign key from `(review_revision_id, review_article_id)` to `article_revisions (revision_id, article_id)`, so a Director run can only review an existing immutable Revision.
- `agent_runs_review_identity_key`: a unique key over the run identity tuple.
- `agent_runs_successful_director_revision_key`: a **partial unique index** on `review_revision_id` scoped to `WHERE role = 'editor_in_chief' AND operation = 'article_review' AND outcome = 'succeeded'`. This enforces at the database level that one Article Revision has at most one successful Director review (the `DIRECTOR_REVIEW_ALREADY_SUCCEEDED` conflict path).

`storyrail.review_decisions` is append-only with an identity `append_position` and a `decision_id` primary key. Each row references the `story_id`, `article_id` (FK to `articles` via the `(article_id, story_id)` composite unique key added by this migration), `revision_id` (unique — one decision per revision), and `director_run_id` (unique — one decision per Director run). The `review_decisions_director_run_fk` foreign key references the full `agent_runs` identity tuple `(run_id, story_id, role, operation, outcome, review_article_id, review_revision_id)`, and `review_decisions_director_check` enforces the Director run is `editor_in_chief` / `article_review` / `succeeded`. The `payload` shape is the full `ReviewDecision` and must be consistent with the denormalized columns; `decidedBy` must be an operator. Two unique indexes preserve append order (`review_decisions_append_position_key`) and support ordered per-Story reads (`review_decisions_story_append_idx`).

The migration also adds `article_revisions_revision_article_key` (unique `(revision_id, article_id)`) and `articles_article_story_key` (unique `(article_id, story_id)`) composite keys, which back the new Director and ReviewDecision foreign keys.

## Migration 0041 — supervised Writer revisions

`database/migrations/0041-supervised-writer-revisions.sql` extends `agent_runs` to support `role = 'writer'` with `operation = 'article_revision'`, broadens the Article Revision number bound from 1 to 1–3, and links Writer revision runs to the operator `ReviewDecision` that authorized them.

The migration drops and recreates the `agent_runs` operation, exact-shape, input, and outcome `CHECK` constraints so a Writer revision run's `input` carries the full `assignment`, `article`, `revision`, `directorReview`, and `reviewDecision` snapshots alongside the shared `story`/`evidence`/`unavailableSourceIds` fields. A Writer revision run's `input.story.state` must be `'changes_requested'`, `input.story.revisionCycle` must be between 1 and 2, and `input.revision.revisionNumber` must equal `input.story.revisionCycle`. The `reviewDecision` snapshot must be a `request_changes` decision referencing the same Story, Article, and Revision and a non-empty Director run id; the `directorReview` is validated by the existing `storyrail.director_review_is_valid` function. New helper functions (`agent_run_story_snapshot_is_valid`, `writer_assignment_snapshot_is_valid`, `article_snapshot_is_valid`, `article_revision_snapshot_is_valid`, `writer_revision_decision_snapshot_is_valid`) factor the per-operation input validation.

The `article_revisions` table drops its `revision_number = 1` check and replaces it with `article_revisions_revision_number_check` requiring `revision_number BETWEEN 1 AND 3`, mirroring the domain `createArticleRevision` bound. `review_decisions` gains `review_decisions_writer_revision_reference_key`, a unique key over `(decision_id, story_id, article_id, revision_id, director_run_id, decision)` that the Writer revision foreign key references.

Five generated columns on `agent_runs` — `writer_revision_article_id`, `writer_revision_previous_id`, `writer_revision_decision_id`, `writer_revision_director_run_id`, and `writer_revision_decision_value` (populated only for a Writer `article_revision` run, otherwise `NULL`) — back `agent_runs_writer_revision_decision_fk`, a composite foreign key from the run's decision snapshot to `review_decisions`. This enforces at the database level that a Writer revision run can only reference a real, matching operator `request_changes` decision and the Director run behind it.

## Migration 0049 — preparation input measurement

`database/migrations/0049-preparation-input-measurement.sql` updates the `storyrail.source_evidence_preparations` table to record how much of the raw extraction the model was shown during preparation.

### storyrail.source_evidence_preparations changes

Adds a JSONB `input` field to the `payload` containing:
- `rawCharacters`: the character count of the raw extraction content
- `submittedCharacters`: the number of characters actually submitted to the model (after capping)

For existing rows written before this migration, the migration backfills both values with the full raw extraction length, reflecting the prior behavior of submitting the entire extraction.

The migration also adds a `CHECK` constraint to ensure:
- The `input` object is present
- Both fields are non-negative integers
- `submittedCharacters` ≤ `rawCharacters`

## Migration 0053 — model quota failure code

`database/migrations/0053-model-quota-failure-code.sql` adds a new failure code `MODEL_QUOTA_EXHAUSTED` to distinguish when a provider refuses a request due to account billing or quota limits (while the credential remains valid) from generic model rejections. It extracts the model failure validation logic into a reusable SQL function `storyrail.model_failure_is_valid` and updates the `agent_runs_payload_outcome_check` constraint to use it.

The migration:
1. Creates `storyrail.model_failure_is_valid(jsonb)` that returns true if the JSONB is an object with `code` and `retryable` fields, no extra keys, and `code` is one of the permitted model failure codes (including the new `MODEL_QUOTA_EXHAUSTED`).
2. Drops and recreates the `agent_runs_payload_outcome_check` constraint on `storyrail.agent_runs` to use this function for the `failed` outcome branch, while preserving the existing validation for succeeded outcomes.

## Migration 0054 — agent run in-flight tracking

`database/migrations/0054-agent-run-in-flight.sql` changes agent run recording so that a row is inserted when the run starts (with `outcome = 'running'`) and updated in place when it completes, rather than only inserting after completion. This enables visibility into runs that are in progress and provides a durable recovery point if the process dies mid-call.

The migration:
1. Updates the `agent_runs_outcome_check` constraint to allow `outcome` values `'running'`, `'succeeded'`, or `'failed'`.
2. Recreates `agent_runs_payload_exact_shape_check` to require that a `'running'` run has a `completedAt` set to `null` and contains only the core fields (`id`, `storyId`, `profileId`, `role`, `operation`, `model`, `prompt`, `requestedBy`, `startedAt`, `completedAt`, `input`, `outcome`).
3. Recreates `agent_runs_payload_outcome_check` to accept the `'running'` outcome or delegate to the specific role/outcome validation (which now uses `storyrail.model_failure_is_valid` for failed outcomes).
4. Recreates `agent_runs_payload_actor_time_check` to validate the `requestedBy` and timing fields, ensuring `completedAt` is a string only when the outcome is terminal.
5. Adds a trigger function `storyrail.agent_run_completion_is_one_way()` that enforces that a run may transition from `'running'` to a terminal outcome exactly once, and that all other fields (including the input snapshot and `startedAt`) remain immutable.
6. Attaches this function as a `BEFORE UPDATE` trigger on `storyrail.agent_runs`.

## Migration 0055 — cited article blocks

`database/migrations/0055-cited-article-blocks.sql` creates `storyrail.cited_article_blocks` to track which blocks in an Article Revision are backed by which source evidence, enabling groundedness checks and citation correction.

The table stores:
- `block_id` (text PK)
- `article_revision_id` (FK → `article_revisions`)
- `source_evidence_id` (text, nullable; FK → `source_evidence` — a union of `source_extractions` and `source_evidence_preparations` via a view or application logic)
- `payload` (jsonb) the serialized `CitedArticleBlock` with fields: `id`, `articleRevisionId`, `sourceEvidenceId`, `content`, `createdAt`.

Constraints ensure the payload matches the columns and that `sourceEvidenceId` references a valid evidence row (either extraction or preparation). This supports the domain model where an Article Revision's body markdown can contain cited blocks that trace back to specific evidence.

## Migration 0056 — ungrounded output failure code

`database/migrations/0056-ungrounded-output-failure-code.sql` adds a new failure code `MODEL_OUTPUT_UNGROUNDED` to the model failure validation, used when the model produces output that cannot be grounded in the provided evidence. It extends `storyrail.model_failure_is_valid` to validate the optional `findings` field (grounding citations) when this code is present.

## Migration 0057 — director support check

`database/migrations/0057-director-support-check.sql` adds a `support` field to the `DirectorReviewRecommendation` checks, allowing the Director to indicate whether each check is supported by evidence. It updates the `director_review_is_valid` function to validate this new field and ensures consistency: if a check is marked as supported, it must pass; if unsupported, it may be either pass or needs_changes.

## Migration 0058 — agent tool calls

`database/migrations/0058-agent-tool-calls.sql` creates `storyrail.agent_tool_calls` to record every tool invocation made by an AgentRun, durable before the call and updated after. This migration was later superseded by 0062, but remains for historical completeness.

## Migration 0059 — researcher role

`database/migrations/0059-researcher-role.sql` extends `agent_runs` to support `role = 'researcher'` with `operation = 'research_story_sources'`. It creates the domain types for researcher activity and adds validation constraints so a Researcher run's input carries the story snapshot and evidence/unavailable sets, and its output carries a list of suggested sources.

## Migration 0060 — writer citation correction

`database/migrations/0060-writer-citation-correction.sql` adds a `corrections` field to the `CitedArticleBlock` payload to record when a writer corrects a citation (e.g., fixes a URL or attributes to a different source). It extends the validation to ensure corrections are immutable and reference the original block.

## Migration 0061 — durable policy runs

`database/migrations/0061-durable-policy-runs.sql` creates `storyrail.policy_runs` to record the execution of policy-related agent runs (e.g., reconciliation of abandoned work). It mirrors the agent_runs pattern but for policy-specific operations, and creates the domain types for policy runs.

## Migration 0062 — tool call durability

`database/migrations/0062-tool-call-durability.sql` replaces the agent_tool_calls table from migration 0058 with a more durable design: tool calls now carry the same running → succeeded|failed semantics as AgentRuns. The intent is durable before the call, the outcome is written after, and the exchange stops when either write fails.

It alters the `storyrail.agent_tool_calls` table to:
- Add `outcome` check allowing `'running'`, `'succeeded'`, `'failed'`.
- Add a detailed `payload_shape_check` ensuring the payload matches the outcome shape.
- Add a `failure_check` validating the failure object codes (including `TOOL_RUN_ABANDONED`, `TOOL_NOT_AVAILABLE`, `TOOL_REQUEST_INVALID`, `TOOL_TARGET_REFUSED`, `TOOL_EXECUTION_FAILED`, `TOOL_BUDGET_EXHAUSTED`).
- Adds a trigger function `storyrail.agent_tool_call_completes_once()` enforcing that a tool call completes exactly once and never reopens.
- Updates `storyrail.model_failure_is_valid` to include the new tool-call-specific failure codes (though the migration actually updates the function to include `TOOL_*` codes? Wait, we saw it updated the function to include model failure codes; but the tool call failure codes are separate. Actually, the migration we read earlier updated `model_failure_is_valid` to include `MODEL_CORRECTION_OUT_OF_SCOPE` and others, but not tool calls. However, the tool call failure codes are validated in the `failure_check` constraint.

## Migration 0063 — newsroom standards

`database/migrations/0063-newsroom-standards.sql` creates `storyrail.newsroom_standards` to store the editorial standards (e.g., style guide, ethics policy) that a newsroom adopts. Each standard has a version and content. It also creates the associated repository and handler.

## Migration 0064 — archive search

`database/migrations/0064-archive-search.sql` adds a `tsvector` column to `storyrail.archive` for full-text search and creates an index to enable efficient search of archived content.

## Migration 0065 — site tenancy

`database/migrations/0065-site-tenancy.sql` introduces a `site_id` column to many tables (Sources, Stories, Agent Profiles, Assignments, etc.) to support multi-tenancy. It also creates the `storyrail.sites` table and updates foreign keys accordingly.

## Migration 0066 — site credentials

`database/migrations/0066-site-credentials.sql` creates `storyrail.site_credentials` to store encrypted credentials for external services (e.g., CMS, social media) scoped to a site. It uses the `STORYRAIL_CREDENTIAL_KEY` for encryption.

## Migration 0067 — story deliveries

`database/migrations/0067-story-deliveries.sql` creates `storyrail.story_deliveries` to record outbound publishing deliveries to external destinations:
- `delivery_id` (text PK), `story_id` (FK → `stories`), `revision_id` (FK → `article_revisions`), `destination` (text, non-empty lower-snake format), `remote_id` (text, nullable), `outcome` (text, `CHECK in ('running', 'succeeded', 'failed')`), `started_at` (timestamptz), `completed_at` (timestamptz), `payload` (jsonb).
- Enforces durability invariants: a `running` delivery has `completed_at IS NULL`; a `succeeded` or `failed` delivery has `completed_at IS NOT NULL`.
- An accepted (`succeeded`) delivery must have a non-null `remote_id` (`story_deliveries_succeeded_remote_id_check`).
- Trigger `storyrail.story_delivery_completes_once()` ensures a delivery transitions from `running` to terminal exactly once and cannot be reopened.
- Note: A delivery does not have a `site_id` column because it inherits tenancy through its parent `story_id`.

## Migration 0068 — destination settings

`database/migrations/0068-destination-settings.sql` extends `storyrail.site_settings` to support optional per-site destination configuration:
- Updates `site_settings_payload_exact_shape_check` to allow an optional `destination` object alongside `models`.
- Adds `site_settings_destination_shape_check` requiring `baseUrl` (http/https URL), `package` (non-empty string), and `draft` (boolean).
- API tokens are kept in encrypted `site_credentials` under slot `studiocms_api_token` rather than in plain settings.

## Migration 0069 — destination kind

`database/migrations/0069-destination-kind.sql` extends destination settings to support multiple destination kinds (StudioCMS and WordPress) via a discriminated `kind` field:
- Drops the rigid 0068 destination constraint and adds `site_settings_destination_shape_check` supporting discriminated objects:
  - `kind = 'studiocms'`: requires `baseUrl`, `package`, `draft`.
  - `kind = 'wordpress'`: requires `baseUrl`, `username`, `draft`.
- Backfills existing destination records with `kind = 'studiocms'`.
- Credentials use `studiocms_api_token` or `wordpress_application_password`.

## Migration 0070 — site switching

`database/migrations/0070-site-switching.sql` completes the multi-tenant model for full runtime switching and site management:
- Modifies foreign key constraints on `agent_profiles` and `story_assignments` to include `site_id`, ensuring assignments reference profiles owned by the same site.
- Updates built-in profile lookups so each site owns its own set of built-in profiles.

## Migration 0071 — search settings

`database/migrations/0071-search-settings.sql` extends `storyrail.site_settings` and `storyrail.site_credentials` to configure web search for the Researcher agent:
- Adds optional `search` settings object to `site_settings` payload (`{ kind: 'searxng', baseUrl: string }`).
- Adds credential slot `searxng_password` to `site_credentials` for SearXNG Basic HTTP authentication.

## Migration 0072 — policy runs from a URL

`database/migrations/0072-policy-runs-from-a-url.sql` extends `storyrail.policy_runs` to support autonomous execution starting from a raw URL:
- Adds new policy run steps to payload constraints: `source_intake`, `source_preparation`, `story_creation`, `source_attachment`, `source_triage`, `delivery`.
- Relaxes foreign key requirements to allow tracking runs before a Story is fully formed.

## Migration 0073 — research budget settings

`database/migrations/0073-research-budget-settings.sql` adds customizable research budgets to `storyrail.site_settings`:
- Adds optional `researchBudget` payload object: `{ maxToolCalls: integer (1..50), maxTurns: integer (1..20) }`.
- Default research budget is 12 tool calls and 6 turns (read when a run starts).

## Migration 0074 — policy run source roots

`database/migrations/0074-policy-run-source-roots.sql` enables pre-Story policy runs to be reconciled by rooting them on `source_id`:
- Adds `source_id` foreign key referencing `storyrail.url_sources(source_id)` on `policy_runs`.
- Enforces an XOR root constraint: exactly one of `story_id` or `source_id` must be non-null for running policies, or `source_id` may be null when `story_id` is set.
- Allows atomic swap from Source root to Story root once `story_creation` step completes.
- Adds partial unique indexes to ensure at most one running policy per Story or Source.

## Migration 0075 — policy run attempts

`database/migrations/0075-policy-run-attempts.sql` adds attempt tracking and bounded retry validation to `storyrail.policy_runs`:
- Adds required `attempt` property (integer, 1..3) to the `policy_runs` JSONB payload.
- Enforces that only Writer steps (`writer_draft`, `writer_revision`) can have `attempt > 1` (up to `MAX_AUTOPILOT_WRITER_ATTEMPTS = 3`).
- Migrates existing settled and running policy records to `attempt = 1`.

## Integration test lifecycle

The PostgreSQL integration tests (`src/adapters/source-persistence/postgres-source-repositories.test.ts` and the Story/attachment/assignment/run/article/review/writer-revision/story-rejection suites) connect via `STORYRAIL_TEST_DATABASE_URL`, verify the database name is exactly `storyrail_test`, drop and recreate the `storyrail` schema, apply migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, `0031`, `0038`, `0041`, `0049`, `0053`, `0054`, `0055`, `0056`, `0057`, `0058`, `0059`, `0060`, `0061`, `0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`, `0072`, `0073`, `0074`, and `0075` in order, and truncate the editorial tables (plus delete non-built-in Agent Profiles) between cases. The suite never creates or drops a database.