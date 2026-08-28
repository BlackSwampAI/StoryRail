---
type: Reference
title: Adapters and runtime composition
description: PostgreSQL persistence plus Firecrawl and OpenRouter adapters, composed into focused runtimes with injectable external seams.
tags: [adapters, postgresql, firecrawl, runtime, composition]
---

# Adapters and runtime composition

## Adapters (`src/adapters`)

Adapters implement the application-layer repository ports against external systems. `src/adapters/index.ts` re-exports the source-extraction, source-persistence, story-persistence, story-inspection, story-listing, story-source-persistence, agent-profile-persistence, agent-run-persistence, assignment-persistence, article-persistence, review-persistence, and story-rejection-persistence adapters (source-inbox, source-triage-persistence, and story-persistence are consumed directly by the runtimes).

### Source extraction: Firecrawl

`src/adapters/source-extraction/source-extractor.ts` defines the `SourceExtractor` port (`descriptor` + `extract(source)`). `firecrawl-source-extractor.ts` implements it against `https://api.firecrawl.dev/v2/scrape`:

- Descriptor: `{ key: "firecrawl", version: "v2" }`.
- Requires a non-empty API key at construction (`FirecrawlSourceExtractorConfigurationError`).
- Maps HTTP status to domain failure codes: 408/504 → `RETRIEVAL_TIMED_OUT` (retryable), 429/500/502/503 → `RETRIEVAL_FAILED` (retryable), 413 → `CONTENT_TOO_LARGE`, 415 → `UNSUPPORTED_CONTENT_TYPE`, other → `RESPONSE_REJECTED`.
- Expects `{ success: true, data: { markdown, metadata } }`; the body is mapped by `mapSuccessfulBody`, which gates the result before any content is built into an `ExtractedSourceDocument`.
- Upstream-failure gate (`upstreamFailure`): Firecrawl answers 200 with `success: true` even when the fetched page answered with an error, reporting the upstream status in `metadata.statusCode`. When that status is an integer and not 2xx, the result is `mapHttpFailure(status)` — the same status→code map as the HTTP-layer path (408/504 → `RETRIEVAL_TIMED_OUT`, 429/500/502/503 → `RETRIEVAL_FAILED`, 413 → `CONTENT_TOO_LARGE`, 415 → `UNSUPPORTED_CONTENT_TYPE`, other → `RESPONSE_REJECTED`). Absent, non-numeric, or fractional status codes are ignored so the content is judged instead.
- Missing or empty markdown → `EXTRACTION_FAILED`.
- Obvious challenge/interstitial Markdown (reCAPTCHA, browser-check, `challenge-platform` markers) → `RESPONSE_REJECTED`. The scrape request sends `proxy: "auto"`, `onlyMainContent: true`, and `maxAge: 0` so each attempt re-fetches the live page.
- Minimum-content floor (`MINIMUM_EXTRACTED_CONTENT_LENGTH = 120`): after the challenge-page check, Markdown whose trimmed length is below 120 chars → `EXTRACTION_FAILED`. The floor is deliberately far below real articles so only empty shells are rejected.
- Builds an `ExtractedSourceDocument` with `format: "markdown"`, the markdown content, optional `title` and `language` from metadata, and null `byline`/`publishedAt`.
- Accepts an injectable `fetch` implementation for testing.

### Structured model: OpenRouter

The provider-neutral structured-model port is implemented with LangChain's `ChatOpenRouter`. The operator selects the model through `STORYRAIL_EVIDENCE_PREPARATION_MODEL`; final prepared documents are validated by StoryRail before an immutable attempt is persisted.

### Credential storage

External service credentials (API keys, etc.) are stored per site in an encrypted credential store. The `postgres-site-credential-persistence.ts` adapter implements the `SiteCredentialRepository` port against the `storyrail.site_credentials` table.

Credentials are encrypted using AES-GCM with a site-specific associated data (the newsroom's site ID and credential slot) and the `STORYRAIL_CREDENTIAL_KEY` environment variable. The store never returns the full credential; instead, it provides a four-character hint (the last four characters of the decrypted value) so operators can verify which credential is stored without exposing secrets.

The credential cipher (`aes-gcm-credential-cipher.ts`) ensures that:
- Credentials are bound to their site and slot (a credential stored for one site cannot be decrypted by another)
- Tampering with ciphertext or authTag is detected and treated as unreadable
- Only the hint is exposed; the actual secret never leaves the encryption boundary

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
| `postgres-writer-revision-persistence.ts`             | `storyrail.agent_runs`, `storyrail.article_revisions`, `storyrail.stories`, `storyrail.story_transition_receipts`, `storyrail.review_decisions` | `WriterRevisionPersistence`                  |
| `postgres-review-decision-persistence.ts`             | `storyrail.review_decisions`, `storyrail.stories`, `storyrail.story_transition_receipts` | `ReviewDecisionPersistence`                  |
| `postgres-review-submission-persistence.ts`           | `storyrail.stories`, `storyrail.story_transition_receipts`           | `ReviewSubmissionPersistence`                        |
| `postgres-story-rejection-persistence.ts`              | `storyrail.stories`, `storyrail.story_transition_receipts`           | `StoryRejectionPersistence`                           |
| `postgres-agent-tool-call-persistence.ts`              | `storyrail.agent_tool_calls`                                         | `AgentToolCallRepository`                             |
| `postgres-newsroom-standards-persistence.ts`           | `storyrail.newsroom_standards`                                       | `NewsroomStandardsRepository`                         |
| `postgres-archive-repository.ts`                       | `storyrail.archive`                                                  | `ArchiveRepository`                                   |
| `postgres-site-credential-persistence.ts`              | `storyrail.site_credentials`                                         | `SiteCredentialRepository`                            |
| `postgres-site-settings-persistence.ts`                | `storyrail.site_settings`                                            | `SiteSettingsRepository`                              |
| `postgres-policy-run-repository.ts`                  | `storyrail.policy_runs`                                              | `PolicyRunRepository`                                |
| `postgres-story-delivery-repository.ts`                | `storyrail.story_deliveries`                                         | `StoryDeliveryRepository`                             |

### Model catalog: OpenRouter

`src/adapters/model-catalog/openrouter-model-catalog.ts` implements `ModelCatalog` against `https://openrouter.ai/api/v1/models`:
- Fetches all available models and filters them to those that support `structured_outputs`.
- Caches the successful model catalog in memory for 15 minutes (`ttlMs: 15 * 60 * 1000`). Failures are never cached.
- Returns models sorted by display name.
- The catalog is never stored in Postgres to avoid state drift with upstream providers.

### Story delivery destinations: StudioCMS and WordPress

StoryRail implements replaceable delivery destinations under `src/adapters/story-delivery/`:

1. **StudioCMS** (`studiocms-destination.ts`):
   - Generates `POST /pages` (for initial creation) and `PATCH /pages/:id` (for revision updates) requests.
   - Maps HTTP status codes to domain `DeliveryFailureCode`s (`401`/`403` → `DESTINATION_UNAUTHORIZED`, `5xx` → `DESTINATION_REJECTED`, `408`/`429` → `DESTINATION_UNREACHABLE`).
   - Parses created page IDs from success messages to track `remoteId`.
   - Encodes boolean flags as numbers (`wireBoolean(draft)`: 1 or 0).

2. **WordPress** (`wordpress-destination.ts`):
   - Generates `POST /wp/v2/posts` with Basic authentication (`username` + encrypted application password from slot `wordpress_application_password`).
   - Serializes article blocks into Gutenberg comments markup (`gutenberg-blocks.ts`): paragraphs (`<!-- wp:paragraph -->...<!-- /wp:paragraph -->`) and headings (`<!-- wp:heading {"level":n} -->...<!-- /wp:heading -->`).
   - Handles slug collision: if WordPress assigns a modified slug, both requested and assigned slugs are recorded in the delivery response.
   - Updates existing posts via `POST /wp/v2/posts/:id` using stored `remoteId`.

`site-delivery-destination-directory.ts` provides a `DeliveryDestinationDirectory` that resolves site settings and credentials (from slots `studiocms_api_token` or `wordpress_application_password`) to construct the appropriate destination instance based on `kind`.

### Newsroom Identity and Standards Injection

`newsroom-identity.ts` defines `formatNewsroomIdentity` and `readNewsroomIdentity`, which fetch a Site's configured name and description dynamically at run start. In conjunction with `newsroom-standards.ts` (`withNewsroomStandards`), all five supervised agent roles (Assignment Editor, Writer draft, Writer revision, Director review, and Source Researcher) receive the newsroom's identity and editorial standards cleanly injected into their system prompts in canonical order: (1) core role rules, (2) newsroom identity, (3) newsroom standards.

`postgres-source-extraction-decoder.ts` decodes a persisted extraction row back into the `SuccessfulSourceExtraction` / `FailedSourceExtraction` union and is shared by the inspection and inbox adapters. All six remaining persistence decoders (`postgres-assignment-decoder.ts`, `postgres-agent-run-decoder.ts`, `postgres-article-decoder.ts`, `postgres-story-delivery-decoder.ts`, `postgres-agent-tool-call-decoder.ts`, `postgres-source-evidence-preparation-decoder.ts`, and `postgres-review-decision-decoder.ts`) reuse the strict domain schemas from `src/domain/editorial/` to ensure unknown persisted facts fail closed across both database reads and browser client consumption without maintaining separate handwritten shapes. The AgentRun decoder handles the discriminated `assignment_proposal` / `article_draft` / `article_revision` / `article_review` union and its succeeded/failed variants, and the review-decision decoder re-validates the payload through the domain `createReviewDecision`. The review persistence adapters are transactional: both lock and recheck the expected Story under `FOR UPDATE` before persisting the transition, and the decision adapter verifies the current Article Revision matches and that no decision exists for that revision before inserting. The Story rejection persistence adapter (`postgres-story-rejection-persistence.ts`) follows the same transactional pattern: it pre-validates that the expected Story is in one of the rejectable states (`intake`, `assigned`, `in_progress`, `in_review`, `changes_requested`), the next state is `rejected`, and the receipt's actor is an `operator`, then `BEGIN`s, selects the Story `FOR UPDATE`, deep-compares the decoded row against the expected Story (`isDeepStrictEqual`), `UPDATE`s the Story, inserts the transition receipt, and verifies the durable result is byte-for-byte equal to the command before `COMMIT`. A changed Story returns `STORY_REJECTION_CONFLICT`; a unique/foreign-key violation (`23505`/`23503`) is also treated as a conflict. It reuses the existing `stories` and `story_transition_receipts` tables and the shared `decodePostgresTransitionReceipt` — no new migration is required. The Writer revision persistence adapter is similarly transactional: it locks and deep-compares the expected Story and current Article Revision under `FOR UPDATE`, takes a `FOR SHARE` lock on the matching ReviewDecision and its Director `AgentRun`, verifies they are byte-for-byte consistent with the run's input snapshot, then inserts the Writer revision `AgentRun`, the next `article_revisions` row, the updated Story, and the transition receipt in one transaction, returning `WRITER_REVISION_CONFLICT` if any expected row changed or a unique/foreign-key violation occurs.

### Web search: SearXNG adapter

`src/adapters/web-search/searxng-web-search.ts` implements the `WebSearchProvider` port against a newsroom-configured SearXNG instance:
- Constructs requests with `format=json`, `q=<query>`, and URL search parameters.
- Authenticates using HTTP Basic Auth when password credentials (`searxng_password`) are provided in the encrypted credential store.
- Parses and bounds results (max 20 candidates, bounded snippet length).
- Distinguishes 401 Unauthorized (credentials refused) from 403 Forbidden (SearXNG instance disabled JSON format output, specifying `search.formats: [..., json]`).
- Guarantees search results remain candidate pointers only and are never treated as grounded evidence directly: evidence requires full URL fetching and extraction.

`site-web-search-directory.ts` provides a `WebSearchDirectory` that dynamically resolves site settings (`search_settings`) and credentials to instantiate `SearXngWebSearch` only when search is enabled and configured for the newsroom.

## Runtime composition (`src/runtime`)

`src/runtime/index.ts` exports the Source-evidence, evidence-preparation, Story, Assignment-editor, Writer, Director, and Site-directory runtime factories and their configuration loaders. Every tenant-aware runtime factory takes a required `siteId: SiteId` parameter.

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
- `createStoryRuntime(options)` builds one `pg.Pool` and constructs the story, attachment, inspection, listing, source-inbox, source-triage, agent-profile, assignment-persistence, review-submission-persistence, review-decision-persistence, story-rejection-persistence, and story-delivery repositories. It wires `createStory`, `attachSourceToStory`, `inspectStory`, `listStories`, `listPendingSources`, `recordSourceTriageDecision`, `createCustomWriterProfile`, `listAgentProfiles`, `assignStory`, `rejectStory`, `submitStoryReview`, `recordStoryReviewDecision`, and `deliverStory`.
- Returns a frozen `StoryRuntime` exposing those operations plus an idempotent `close()`.
- `createStoryRuntimeFromEnvironment(options)` reads `STORYRAIL_DATABASE_URL` from `process.env` (or an injected environment).

### Assignment-editor runtime

`src/runtime/assignment-editor-runtime.ts` requires `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and `STORYRAIL_ASSIGNMENT_EDITOR_MODEL` (`assignment-editor-configuration.ts`). It composes the story-inspection, agent-profile, and agent-run PostgreSQL repositories with an OpenRouter `StructuredModel` into `generateAssignmentProposal`. It owns one `pg.Pool` and exposes a frozen `AssignmentEditorRuntime` with that workflow plus an idempotent `close()`. Missing configuration surfaces as `AssignmentEditorRuntimeConfigurationError`, which the HTTP handler maps to `503 ASSIGNMENT_EDITOR_UNAVAILABLE`.

### Writer runtime

`src/runtime/writer-runtime.ts` requires `STORYRAIL_DATABASE_URL` and `OPENROUTER_API_KEY`; `STORYRAIL_WRITER_MODEL` is an optional default (`writer-configuration.ts`). It composes the story-inspection, agent-run, writer-draft, and writer-revision PostgreSQL repositories and resolves the executable model per run via `resolveWriterModel`: a Profile OpenRouter model wins, otherwise `STORYRAIL_WRITER_MODEL` is required; non-OpenRouter providers are rejected (`WRITER_MODEL_UNSUPPORTED`). It owns one `pg.Pool` and exposes a frozen `WriterRuntime` with `createWriterDraft` (the `assigned` → `in_progress` first-draft flow) and `createWriterRevision` (the `changes_requested` → `in_progress` revision loop, bounded at Revision 3) plus an idempotent `close()`. Missing configuration surfaces as `WriterRuntimeConfigurationError`, which the HTTP handler maps to `503 WRITER_UNAVAILABLE`.

### Director runtime

`src/runtime/director-runtime.ts` requires `STORYRAIL_DATABASE_URL` and `OPENROUTER_API_KEY`; `STORYRAIL_DIRECTOR_MODEL` is an optional default (`director-configuration.ts`). It composes the story-inspection, agent-profile, and agent-run PostgreSQL repositories with an OpenRouter `StructuredModel` into `runDirectorReview`. It resolves the executable model per run via `resolveDirectorModel`: the built-in Director Profile's OpenRouter model wins, otherwise `STORYRAIL_DIRECTOR_MODEL` is required; non-OpenRouter providers are rejected (`DIRECTOR_MODEL_UNSUPPORTED`). The built-in Director Profile has a `null` model, so `STORYRAIL_DIRECTOR_MODEL` is the normal configuration. It owns one `pg.Pool` and exposes a frozen `DirectorRuntime` with `runDirectorReview` plus an idempotent `close()`. Missing configuration surfaces as `DirectorRuntimeConfigurationError`, which the HTTP handler maps to `503 DIRECTOR_UNAVAILABLE`.

### Researcher runtime

`src/runtime/researcher-runtime.ts` requires `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and `FIRECRAWL_API_KEY`. It composes story inspections, agent profiles, agent runs, agent tool calls, source research persistence, Firecrawl URL extraction, PostgreSQL archive repository, and SearXNG web search directory into `researchStorySources`. It provides dynamic research widening for Stories with up to a configurable per-site research tool call budget.

## Injectable seams

All seven runtimes accept optional `createPool`, `createUuid`, and `now` overrides (the Source-evidence and Writer runtimes also accept `fetch`/model adapters where applicable).

## Server providers (`src/server`)

Runtime providers in `src/server/` manage lazy runtime creation:
- Multi-tenant runtimes are wrapped with `createSiteKeyedRuntimeProvider` (`site-keyed-runtime-provider.ts`), creating and caching independent runtime instances keyed by `SiteId`. Unknown sites are never cached.
- Providers include `sourceEvidenceRuntimeProvider`, `evidencePreparationRuntimeProvider`, `storyRuntimeProvider`, `assignmentEditorRuntimeProvider`, `writerRuntimeProvider`, `directorRuntimeProvider`, and `siteDirectoryProvider` (`site-directory-provider.ts`).
- `site-route.ts` provides the `withSite` higher-order wrapper, resolving `siteId` from URL route params and returning `404` early if the site does not exist before invoking the HTTP handler.
