---
type: Reference
title: Adapters and runtime composition
description: PostgreSQL persistence plus Firecrawl and OpenRouter adapters, composed into focused runtimes with injectable external seams.
tags: [adapters, postgresql, firecrawl, runtime, composition]
---

# Adapters and runtime composition

## Adapters (`src/adapters`)

Adapters implement the application-layer repository ports against external systems. `src/adapters/index.ts` re-exports the source-extraction, source-persistence, story-persistence, story-inspection, story-listing, story-source-persistence, agent-profile-persistence, agent-run-persistence, assignment-persistence, and article-persistence adapters (source-inbox, source-triage-persistence, and story-persistence are consumed directly by the runtimes).

### Source extraction: Firecrawl

`src/adapters/source-extraction/source-extractor.ts` defines the `SourceExtractor` port (`descriptor` + `extract(source)`). `firecrawl-source-extractor.ts` implements it against `https://api.firecrawl.dev/v2/scrape`:

- Descriptor: `{ key: "firecrawl", version: "v2" }`.
- Requires a non-empty API key at construction (`FirecrawlSourceExtractorConfigurationError`).
- Maps HTTP status to domain failure codes: 408/504 → `RETRIEVAL_TIMED_OUT` (retryable), 429/500/502/503 → `RETRIEVAL_FAILED` (retryable), 413 → `CONTENT_TOO_LARGE`, 415 → `UNSUPPORTED_CONTENT_TYPE`, other → `RESPONSE_REJECTED`.
- Expects `{ success: true, data: { markdown, metadata } }`; missing/empty markdown → `EXTRACTION_FAILED`.
- Builds an `ExtractedSourceDocument` with `format: "markdown"`, the markdown content, optional `title` and `language` from metadata, and null `byline`/`publishedAt`.
- Accepts an injectable `fetch` implementation for testing.
- Sends `proxy: "auto"` and rejects obvious challenge/interstitial Markdown as a failed `RESPONSE_REJECTED` extraction.

### Structured model: OpenRouter

The provider-neutral structured-model port is implemented with LangChain's `ChatOpenRouter`. The operator selects the model through `STORYRAIL_EVIDENCE_PREPARATION_MODEL`; final prepared documents are validated by StoryRail before an immutable attempt is persisted.

### PostgreSQL persistence adapters

All PostgreSQL adapters share a defensive pattern: they serialize the domain object to JSONB `payload`, store denormalized relational columns alongside it, and decode rows back into typed domain objects with strict shape validation (`hasExactKeys`, `isActor`, `isAgentRole`). Any row that fails the expected shape throws an `*InvariantError`, treating a corrupted payload as a programming error rather than returning malformed data.

| Adapter                                              | Table(s)                                                             | Port implemented                                    |
| ---------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------- |
| `postgres-source-repositories.ts`                    | `storyrail.url_sources`, `storyrail.source_extractions`              | `UrlSourceRepository`, `SourceExtractionRepository` |
| `postgres-story-repository.ts`                       | `storyrail.stories`                                                  | `StoryRepository`                                   |
| `postgres-story-source-attachment-repository.ts`     | `storyrail.story_source_attachments`                                 | `StorySourceAttachmentRepository`                   |
| `postgres-story-inspection-repository.ts`            | joins stories + attachments + sources + extractions                  | `StoryInspectionRepository`                         |
| `postgres-story-listing-repository.ts`               | `storyrail.stories` + attachment count                               | `StoryListingRepository`                            |
| `postgres-source-inbox-repository.ts`                | sources + extractions left join triage                               | `SourceInboxRepository`                             |
| `postgres-source-triage-decision-repository.ts`      | `storyrail.source_triage_decisions`                                  | `SourceTriageDecisionRepository`                    |
| `postgres-source-evidence-preparation-repository.ts` | `storyrail.source_evidence_preparations`                             | `SourceEvidencePreparationRepository`               |
| `postgres-agent-profile-repository.ts`               | `storyrail.agent_profiles`                                           | `AgentProfileRepository`                            |
| `postgres-assignment-persistence.ts`                 | `storyrail.story_assignments`, `storyrail.story_transition_receipts` | `AssignmentPersistence`                             |
| `postgres-agent-run-repository.ts`                   | `storyrail.agent_runs`                                               | `AgentRunRepository`                                |
| `postgres-writer-draft-persistence.ts`               | `storyrail.articles`, `storyrail.article_revisions`                  | `WriterDraftPersistence`                            |

`postgres-source-extraction-decoder.ts` decodes a persisted extraction row back into the `SuccessfulSourceExtraction` / `FailedSourceExtraction` union and is shared by the inspection and inbox adapters. `postgres-assignment-decoder.ts`, `postgres-agent-run-decoder.ts`, and `postgres-article-decoder.ts` perform the same strict-shape decoding for their respective payloads; the AgentRun decoder must handle the discriminated `assignment_proposal` / `article_draft` union and its succeeded/failed variants.

## Runtime composition (`src/runtime`)

`src/runtime/index.ts` exports the Source-evidence, evidence-preparation, Story, Assignment-editor, and Writer runtime factories and their configuration loaders.

### Source-evidence runtime

`src/runtime/source-evidence-runtime.ts`:

- Configuration (`source-evidence-configuration.ts`): requires `STORYRAIL_DATABASE_URL` and `FIRECRAWL_API_KEY`; throws `SourceEvidenceRuntimeConfigurationError` with a specific code when either is missing/blank.
- `createSourceEvidenceRuntime(options)` builds one `pg.Pool` from the database URL (or an injected `createPool`), constructs the PostgreSQL source repositories and the Firecrawl extractor (with an injectable `fetch`), and wires the `preserveUrlSource`, `extractPersistedSource`, and `preserveAndExtractUrlSource` workflows.
- Returns a frozen `SourceEvidenceRuntime` exposing those three workflows plus a idempotent `close()` that ends the pool once.
- `createSourceEvidenceRuntimeFromEnvironment(options)` loads configuration from `process.env` (or an injected environment) and delegates to `createSourceEvidenceRuntime`.

### Evidence-preparation runtime

`src/runtime/evidence-preparation-runtime.ts` requires PostgreSQL, `OPENROUTER_API_KEY`, and `STORYRAIL_EVIDENCE_PREPARATION_MODEL`. It composes raw-evidence repositories, immutable preparation persistence, and the LangChain/OpenRouter structured-model adapter into `prepareSourceEvidence`.

### Story runtime

`src/runtime/story-runtime.ts`:

- Requires only `STORYRAIL_DATABASE_URL`; throws `StoryRuntimeConfigurationError` (`STORYRAIL_DATABASE_URL_REQUIRED`) when missing/blank.
- `createStoryRuntime(options)` builds one `pg.Pool` and constructs the story, attachment, inspection, listing, source-inbox, source-triage, agent-profile, and assignment-persistence repositories. It wires `createStory`, `attachSourceToStory`, `inspectStory`, `listStories`, `listPendingSources`, `recordSourceTriageDecision`, `createCustomWriterProfile`, `listAgentProfiles`, and `assignStory`.
- Returns a frozen `StoryRuntime` exposing those nine operations plus an idempotent `close()`.
- `createStoryRuntimeFromEnvironment(options)` reads `STORYRAIL_DATABASE_URL` from `process.env` (or an injected environment).

### Assignment-editor runtime

`src/runtime/assignment-editor-runtime.ts` requires `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and `STORYRAIL_ASSIGNMENT_EDITOR_MODEL` (`assignment-editor-configuration.ts`). It composes the story-inspection, agent-profile, and agent-run PostgreSQL repositories with an OpenRouter `StructuredModel` into `generateAssignmentProposal`. It owns one `pg.Pool` and exposes a frozen `AssignmentEditorRuntime` with that workflow plus an idempotent `close()`. Missing configuration surfaces as `AssignmentEditorRuntimeConfigurationError`, which the HTTP handler maps to `503 ASSIGNMENT_EDITOR_UNAVAILABLE`.

### Writer runtime

`src/runtime/writer-runtime.ts` requires `STORYRAIL_DATABASE_URL` and `OPENROUTER_API_KEY`; `STORYRAIL_WRITER_MODEL` is an optional default (`writer-configuration.ts`). It composes the story-inspection, agent-run, and writer-draft PostgreSQL repositories and resolves the executable model per run via `resolveWriterModel`: a Profile OpenRouter model wins, otherwise `STORYRAIL_WRITER_MODEL` is required; non-OpenRouter providers are rejected (`WRITER_MODEL_UNSUPPORTED`). It owns one `pg.Pool` and exposes a frozen `WriterRuntime` with `createWriterDraft` plus an idempotent `close()`. Missing configuration surfaces as `WriterRuntimeConfigurationError`, which the HTTP handler maps to `503 WRITER_UNAVAILABLE`.

## Injectable seams

Both runtimes accept optional `createPool`, `fetch`, `createUuid`, and `now` overrides. All five runtime unit tests (`source-evidence-runtime.test.ts`, `story-runtime.test.ts`, `assignment-editor-runtime.test.ts`, `writer-runtime.test.ts`, and `evidence-preparation-runtime.test.ts`) inject Pool, fetch, UUID, and clock substitutes, so they require no real PostgreSQL or Firecrawl access. The PostgreSQL integration tests (`src/adapters/source-persistence/postgres-source-repositories.test.ts`) run the contracts against real PostgreSQL 18.4.

## Server providers (`src/server`)

`src/server/*-runtime-provider.ts` are lazy singletons: `get()` builds the runtime from environment on first call and caches it. Next.js route handlers receive `getRuntime: provider.get`, so the pool is created only when a request first needs it. Providers exist for the Source-evidence, evidence-preparation, Story, Assignment-editor (`assignment-editor-runtime-provider.ts`), and Writer (`writer-runtime-provider.ts`) runtimes.
