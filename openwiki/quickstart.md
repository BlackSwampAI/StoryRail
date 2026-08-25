---
type: Quickstart
title: StoryRail quickstart
description: How to install, run, and manually verify the StoryRail pre-alpha editorial control plane on a local development machine.
tags: [quickstart, setup, development]
---
# StoryRail quickstart

StoryRail is a pre-alpha, agent-first editorial control plane for solo publishers and small editorial teams. It is **not** ready for production use. The repository currently contains an implemented vertical slice from URL Source intake through Firecrawl extraction (with operator-driven extraction retry that appends a new attempt to the Source's immutable history), optional Prepared Evidence, durable Story creation, Source-Source attachment, Story inspection, a pending Source inbox with manual triage, durable Agent Profiles, durable manual Assignments (with the first `intake` → `assigned` Story transition), supervised Assignment Editor proposals, supervised Writer execution that creates the first Article and immutable Revision 1 (with the `assigned` → `in_progress` transition), operator review submission (`in_progress` → `in_review`), supervised advisory Director review recorded as a Director `AgentRun`, an operator-owned ReviewDecision that atomically transitions the Story to `approved` or `changes_requested`, supervised Writer revisions that append immutable Revision 2 or 3 from the exact historical evidence, Director review, and operator request-changes reason (with the `changes_requested` → `in_progress` transition, bounded at Revision 3), explicit operator Story rejection that terminally transitions `intake`, `assigned`, `in_progress`, `in_review`, or `changes_requested` to `rejected` with a required reason and atomic receipt, Story delivery to external publishing destinations (e.g. StudioCMS), model catalog discovery filtered by structured-output capabilities, and the newsroom workbench that ties them together.

## Prerequisites

- Node.js 24.18.0 (see `.nvmrc`; `package.json` engines require `>=24.15.0 <25`)
- pnpm 11.20.0 through Corepack
- PostgreSQL 18.4 for the Source-evidence, Story, and Story-Source persistence integration tests (and for a composed runtime that persists Source evidence or Story state)

## Install and run

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://localhost:3000>. The page should identify StoryRail as a pre-alpha editorial control plane. Source Intake preserves and extracts a URL, then prepares it for review and offers to open it in the Source Inbox, where an operator may triage it into a new or existing Story or skip coverage. The newsroom shell loads persisted Stories and their authoritative inspections; from an Intake Story an operator can drag a Writer Profile onto the Story workspace to create a durable Assignment, optionally request a supervised Assignment Editor suggestion, and run the assigned Writer to produce the first Article draft.

## Runtime configuration

StoryRail composes six independent server-only runtimes, each owning its own `pg.Pool` and operating within the context of a site (identified by `STORYRAIL_SITE_ID`):

- **Source-evidence runtime** — `STORYRAIL_DATABASE_URL`, `FIRECRAWL_API_KEY`.
- **Evidence-preparation runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_EVIDENCE_PREPARATION_MODEL`.
- **Story runtime** — `STORYRAIL_DATABASE_URL` only. Owns Story, attachment, inspection, listing, inbox, triage, Agent Profile, manual Assignment, Story rejection, review submission, and review decision workflows.
- **Assignment-editor runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_ASSIGNMENT_EDITOR_MODEL`. Generates supervised Assignment Editor proposals.
- **Writer runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and either a per-Profile OpenRouter model or `STORYRAIL_WRITER_MODEL` as the default. Creates the first Article draft and runs supervised revisions after an operator requests changes.
- **Director runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and either the built-in Director Profile's OpenRouter model or `STORYRAIL_DIRECTOR_MODEL` as the default. Runs the supervised advisory Director review against an In Review Story.

The following environment variables configure the system:

- `STORYRAIL_DATABASE_URL`: PostgreSQL connection string.
- `STORYRAIL_CREDENTIAL_KEY`: 32-byte base64 key for encrypting stored credentials (see `.env.example`). It cannot be recovered if lost. This key encrypts credentials stored per site in the `storyrail.site_credentials` table.
- `STORYRAIL_SITE_ID`: optional site identifier; if set, the newsroom is bound to that site. Leave unset for single-site mode.
- `STORYRAIL_OPERATOR_ID`: fixed operator ID for attributing actions (development only); not used for authentication.
- `FIRECRAWL_API_KEY`: for Source extraction via Firecrawl.
- `OPENROUTER_API_KEY`: for language model calls via OpenRouter.
- `STORYRAIL_EVIDENCE_PREPARATION_MODEL`: model identifier for evidence preparation.
- `STORYRAIL_ASSIGNMENT_EDITOR_MODEL`: model identifier for Assignment Editor proposals.
- `STORYRAIL_WRITER_MODEL`: default model identifier for Writer (can be overridden per Agent Profile).
- `STORYRAIL_DIRECTOR_MODEL`: model identifier for Director review (can be overridden per Director Profile).

`STORYRAIL_OPERATOR_ID` attributes intake, preparation, attachment, triage, assignment, proposal, writer draft, writer revision, review submission, review decision, and Story rejection actions to the fixed development operator; it is not authentication. Normal Story, Inbox, triage, inspection, Agent Profile, and manual Assignment workflows do not require Firecrawl or OpenRouter. `.env.example` documents names only; never commit credentials or connection strings.

## Manual verification order

Maintainer-owned validation runs the project checks in this order:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' pnpm test:postgres
pnpm build
git diff --check
pnpm dev
```

## PostgreSQL integration tests

Source-evidence, Story, attachment, triage, preparation, Agent Profile, Assignment, AgentRun, Article, Article Revision, Writer revision, review submission, review decision, Director review, Story rejection, tool calls, newsroom standards, archive search, site credentials, site settings, and story delivery persistence integration tests run against real PostgreSQL 18.4 (no mocks, testcontainers, or embedded databases). Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. The configured database name **must** be exactly `storyrail_test`. The suite never creates or drops a database, but it does drop and recreate the `storyrail` schema, applies migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, `0031`, `0038`, `0041`, `0049`, `0053`, `0054`, `0055`, `0056`, `0057`, `0058`, `0059`, `0060`, `0061`, `0062`, `0063`, `0064`, `0065`, `0066`, `0067`, and `0068` in order, truncates the editorial tables (and deletes non-built-in Agent Profiles) between cases.

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated `test:postgres` command fails before Vitest when the variable is absent.

## Task routing

| Change area or intent          | Wiki page                                                                                                                    | Source entry points                                                                                                                                | Important symbols                                                       | Focused tests                                                                        | Minimal validation               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| Source intake / extraction     | [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md)                                                             | `src/adapters/source-extraction/firecrawl-source-extractor.ts`, `src/runtime/source-evidence-runtime.ts`, `src/interfaces/http/extract-persisted-source-handler.ts`, `src/app/api/sources/[sourceId]/extractions/route.ts`                                           | `firecrawlSourceExtractor`, `createSourceEvidenceRuntime`, `createExtractPersistedSourceHttpHandler`, `extractPersistedSource`               | `firecrawl-source-extractor.test.ts`, `source-evidence-runtime.test.ts`, `extract-persisted-source-handler.test.ts`              | `pnpm test source-evidence`      |
| Source extraction retry (UI)   | [Newsroom UI shell](architecture/newsroom-ui.md)                                                                                                                | `src/features/newsroom/source-evidence-workspace.tsx`, `src/features/newsroom/source-inbox-workspace.tsx`, `src/features/newsroom/source-inbox-client.ts`                                            | `SourceEvidenceWorkspace`, `retryExtraction`, `retryableSource`                                          | `source-evidence-workspace.test.tsx`, `source-inbox-workspace.test.tsx`, `source-inbox-client.test.ts`                            | `pnpm test newsroom`            |
| Prepared Evidence              | [Application workflows](architecture/application-workflows.md)                                                               | `src/application/source-evidence-preparation/prepare-source-evidence.ts`, `src/runtime/evidence-preparation-runtime.ts`                            | `prepareSourceEvidence`, `createEvidencePreparationRuntime`             | `prepare-source-evidence.test.ts`                                                    | `pnpm test evidence-preparation` |
| Story / attachment / triage    | [Application workflows](architecture/application-workflows.md)                                                               | `src/application/story-creation/create-story.ts`, `src/application/source-triage/record-source-triage-decision.ts`, `src/runtime/story-runtime.ts` | `createStory`, `recordSourceTriageDecision`, `createStoryRuntime`       | `create-story.test.ts`, `record-source-triage-decision.test.ts`                      | `pnpm test story`                |
| Agent Profiles                 | [Domain model](architecture/domain-model.md), [HTTP API](architecture/http-api.md)                                           | `src/domain/editorial/agent-profile.ts`, `src/application/agent-profiles/create-custom-writer-profile.ts`                                          | `createAgentProfile`, `createCreateCustomWriterProfile`                 | `agent-profile.test.ts`, `create-custom-writer-profile.test.ts`                      | `pnpm test agent-profile`        |
| Durable Assignments            | [Domain model](architecture/domain-model.md), [Application workflows](architecture/application-workflows.md)                 | `src/domain/editorial/assignment.ts`, `src/application/assignments/assign-story.ts`                                                                | `createAssignment`, `createAssignStory`                                 | `assignment.test.ts`, `assign-story.test.ts`                                         | `pnpm test assign`               |
| Assignment Editor proposals    | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/assignment-proposals/generate-assignment-proposal.ts`, `src/runtime/assignment-editor-runtime.ts`                                 | `createGenerateAssignmentProposal`, `createAssignmentEditorRuntime`     | `generate-assignment-proposal.test.ts`, `assignment-editor-runtime-provider.test.ts` | `pnpm test assignment-proposal`  |
| AgentRun records               | [Domain model](architecture/domain-model.md)                                                                                 | `src/domain/editorial/agent-run.ts`, `src/application/agent-runs/agent-run-repository.ts`                                                          | `recordAgentRun`, `AgentRunRepository`                                  | `agent-run.test.ts`, `agent-run-repository.test.ts`                                  | `pnpm test agent-run`            |
| Writer drafts / Articles / Revisions | [Domain model](architecture/domain-model.md), [Application workflows](architecture/application-workflows.md)                 | `src/domain/editorial/article.ts`, `src/application/writer-drafts/create-writer-draft.ts`, `src/application/writer-revisions/create-writer-revision.ts`, `src/runtime/writer-runtime.ts`                         | `createFirstArticleRevision`, `createArticleRevision`, `createWriterDraft`, `createWriterRevision`, `resolveWriterModel` | `article.test.ts`, `create-writer-draft.test.ts`, `create-writer-revision.test.ts`                                     | `pnpm test writer`              |
| Review submission / Director review / Review decision | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/review-submissions/submit-story-review.ts`, `src/application/director-reviews/run-director-review.ts`, `src/application/review-decisions/record-story-review-decision.ts`, `src/runtime/director-runtime.ts`, `src/runtime/story-runtime.ts` | `createSubmitStoryReview`, `createRunDirectorReview`, `createRecordStoryReviewDecision`, `createDirectorRuntime` | `submit-story-review.test.ts`, `run-director-review.test.ts`, `record-story-review-decision.test.ts`, `director-configuration.test.ts` | `pnpm test review`              |
| Story rejection            | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md) | `src/application/story-rejections/reject-story.ts`, `src/adapters/story-rejection-persistence/postgres-story-rejection-persistence.ts`, `src/interfaces/http/reject-story-handler.ts`, `src/runtime/story-runtime.ts` | `createRejectStory`, `createPostgresStoryRejectionPersistence`, `createRejectStoryHttpHandler` | `reject-story.test.ts`, `postgres-story-rejection-persistence.test.ts`, `reject-story-handler.test.ts` | `pnpm test reject`              |
| Site credentials             | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md) | `src/adapters/credential-cipher/aes-gcm-credential-cipher.ts`, `src/adapters/site-credential-persistence/postgres-site-credential-repository.ts`, `src/application/site-credentials/index.ts`, `src/app/api/site-credentials/[slot]/route.ts` | `createAesGcmCredentialCipher`, `createPostgresSiteCredentialRepository`, `createSiteCredentialRepository`, `createSiteCredentialHttpHandler` | `aes-gcm-credential-cipher.test.ts`, `postgres-site-credential-repository.test.ts`, `site-credentials/index.test.ts`, `site-credentials/[slot]/route.test.ts` | `pnpm test credential-cipher`    |
| Model catalog discovery      | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md) | `src/adapters/model-catalog/openrouter-model-catalog.ts`, `src/application/model-catalog/model-catalog.ts`, `src/interfaces/http/model-catalog-handlers.ts`, `src/app/api/model-catalog/route.ts` | `createOpenRouterModelCatalog`, `createModelCatalogHttpHandler`, `modelCatalogProvider` | `openrouter-model-catalog.test.ts`, `model-catalog-handlers.test.ts` | `pnpm test model-catalog`        |
| Story delivery / destinations| [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [Domain model](architecture/domain-model.md), [HTTP API](architecture/http-api.md) | `src/domain/editorial/story-delivery.ts`, `src/application/story-deliveries/deliver-story.ts`, `src/adapters/story-delivery/studiocms-destination.ts`, `src/adapters/story-delivery-persistence/postgres-story-delivery-repository.ts`, `src/app/api/stories/[storyId]/deliveries/route.ts` | `recordStoryDelivery`, `createDeliverStory`, `createStudioCmsDestination`, `createPostgresStoryDeliveryRepository`, `createDeliverStoryHttpHandler` | `story-delivery.test.ts`, `deliver-story.test.ts`, `studiocms-destination.test.ts`, `site-delivery-destination-directory.test.ts`, `deliver-story-handler.test.ts` | `pnpm test delivery`             |
| Newsroom standards           | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md) | `src/adapters/newsroom-standards-persistence/postgres-newsroom-standards-repository.ts`, `src/application/newsroom-standards/index.ts`, `src/app/api/newsroom-standards/route.ts` | `createPostgresNewsroomStandardsRepository`, `createNewsroomStandardsRepository`, `createNewsroomStandardsHttpHandler` | `postgres-newsroom-standards-repository.test.ts`, `newsroom-standards/index.test.ts`, `newsroom-standards/route.test.ts` | `pnpm test newsroom-standards`   |
| Archive search               | [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md)                                 | `src/application/archive/index.ts`, `src/application/archive/search-archive-tool.ts`, `src/adapters/archive/postgres-archive-repository.ts` | `createArchiveRepository`, `createSearchArchiveTool`, `createPostgresArchiveRepository` | `archive/index.test.ts`, `archive/search-archive-tool.test.ts`, `postgres-archive-repository.test.ts` | `pnpm test archive`              |
| Tool calls                   | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [Domain model](architecture/domain-model.md) | `src/adapters/agent-tool-call-persistence/postgres-agent-tool-call-repository.ts`, `src/application/agent-tools/agent-tool-call-repository.ts`, `src/domain/editorial/agent-tool-call.ts` | `createPostgresAgentToolCallRepository`, `createAgentToolCallRepository`, `createAgentToolCall` | `postgres-agent-tool-call-repository.test.ts`, `agent-tool-call-repository.test.ts`, `agent-tool-call.test.ts` | `pnpm test agent-tool-call`      |
| PostgreSQL schema / migrations | [Database schema](architecture/database-schema.md)                                                                           | `database/migrations/*.sql`, `src/adapters/source-persistence/postgres-source-repositories.test.ts`                                                | migration setup + truncate guard                                        | `postgres-source-repositories.test.ts`                                               | `pnpm test:postgres`             |
| HTTP endpoints                 | [HTTP API](architecture/http-api.md)                                                                                         | `src/interfaces/http/*-handler.ts`, `src/app/api/**/route.ts`                                                                                      | `create*HttpHandler`, route `GET`/`POST`/`PUT` exports                  | `*-handler.test.ts`, `story-http-handlers.test.ts`                                   | `pnpm test http`                 |
| Newsroom UI                    | [Newsroom UI shell](architecture/newsroom-ui.md)                                                                             | `src/features/newsroom/newsroom-shell.tsx`, `story-workspace.tsx`                                                                                  | `NewsroomShell`, `StoryWorkspace`                                       | `newsroom-shell.test.tsx`, `story-writer-drop.test.tsx`                              | `pnpm test newsroom`             |

## Navigation

- [Architecture overview](architecture/overview.md) — layered hexagonal structure and the six composed runtimes.
- [Editorial domain model](architecture/domain-model.md) — Source, Story, Agent Profile, Assignment, Assignment Proposal, AgentRun, Director review, ReviewDecision, Article, and bounded Article Revision (1–3) domain rules.
- [Application workflows](architecture/application-workflows.md) — use-case orchestration and repository ports.
- [Adapters and runtime composition](architecture/adapters-and-runtime.md) — PostgreSQL, Firecrawl, and OpenRouter adapters composed into focused runtimes including the Director runtime.
- [HTTP API endpoints](architecture/http-api.md) — Next.js route handlers and status code maps.
- [PostgreSQL schema and migrations](architecture/database-schema.md) — the `storyrail` schema and migrations `0012`–`0066`.
- [Newsroom UI shell](architecture/newsroom-ui.md) — resizable desk, staff sidebar, Story workspace with assignment, writing, Writer revision, review submission, Director review, operator decision, and operator Story rejection, and SafeMarkdown.
- [Repository source map](architecture/source-map.md) — canonical file and directory locations.
- [Engineering workflow and testing](engineering-workflow.md) — branch/batch discipline, verification ownership, CI contract, and the testing strategy.

## Backlog

Publishing/export remains planned. The domain state machine already permits `approved` → `published`, but no application workflow or UI exercises that transition yet.