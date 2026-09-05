---
type: Quickstart
title: StoryRail quickstart
description: How to install, run, and manually verify the StoryRail pre-alpha editorial control plane on a local development machine.
tags: [quickstart, setup, development]
---
# StoryRail quickstart

StoryRail is a pre-alpha, agent-first editorial control plane for solo publishers and small editorial teams. It is **not** ready for production use. The repository currently contains an implemented vertical slice from URL Source intake through Firecrawl extraction (with operator-driven extraction retry that appends a new attempt to the Source's immutable history), optional Prepared Evidence, durable Story creation, Source-Source attachment, Story inspection (with real-time tool activity stream and budget metrics), a pending Source inbox with manual triage, durable Agent Profiles, durable manual Assignments (with the first `intake` → `assigned` Story transition), supervised Assignment Editor proposals, supervised Writer execution that creates the first Article and immutable Revision 1 (with the `assigned` → `in_progress` transition), operator review submission (`in_progress` → `in_review`), supervised advisory Director review recorded as a Director `AgentRun`, an operator-owned ReviewDecision that atomically transitions the Story to `approved` or `changes_requested`, supervised Writer revisions that append immutable Revision 2 or 3 from the exact historical evidence, Director review, and operator request-changes reason (with the `changes_requested` → `in_progress` transition, bounded at Revision 3), explicit operator Story rejection that terminally transitions `intake`, `assigned`, `in_progress`, `in_review`, or `changes_requested` to `rejected` with a required reason and atomic receipt, Story delivery to external publishing destinations (e.g. StudioCMS and WordPress), autonomous URL-to-delivered and Story-to-delivered Autopilot sequences with bounded Writer retries and reconcilable Source/Story-rooted policy runs, web search research with SearXNG, model catalog discovery filtered by structured-output capabilities, shared strict domain schemas preventing persistence/client drift, and the newsroom workbench that ties them together on an interactive Story Rail.

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

Open <http://localhost:3000>. Visiting `/` resolves the configured or first available newsroom and redirects to `/s/[siteId]`. The page identifies StoryRail as a pre-alpha editorial control plane. Operators can create and switch newsrooms, preserve and extract URLs, triage incoming Sources, create Stories, drag Writer profiles onto Stories to assign them, request supervised Assignment Editor suggestions, run assigned Writers to produce Articles, toggle between claim-annotated and plain prose reading views, submit stories for review, run advisory Director reviews, approve or request bounded revisions, deliver published Stories to StudioCMS or WordPress, and inspect delivery outcomes.

## Runtime configuration

StoryRail composes site-scoped server runtimes backed by `pg.Pool`s and a Site Directory:

- **Site Directory runtime** — `STORYRAIL_DATABASE_URL`. Resolves, lists, and creates Sites (`storyrail.sites`) and seeds built-in Agent Profiles.
- **Source-evidence runtime** — `STORYRAIL_DATABASE_URL`, `FIRECRAWL_API_KEY`.
- **Evidence-preparation runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_EVIDENCE_PREPARATION_MODEL`.
- **Story runtime** — `STORYRAIL_DATABASE_URL` only. Owns Story, attachment, inspection, listing, inbox, triage, Agent Profile, manual Assignment, Story rejection, review submission, review decision, and Story delivery workflows.
- **Assignment-editor runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_ASSIGNMENT_EDITOR_MODEL`. Generates supervised Assignment Editor proposals informed by newsroom identity and standards.
- **Writer runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and either a per-Profile OpenRouter model or `STORYRAIL_WRITER_MODEL` as the default. Creates Article drafts and supervised revisions informed by newsroom identity and standards.
- **Director runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and either the built-in Director Profile's OpenRouter model or `STORYRAIL_DIRECTOR_MODEL` as the default. Runs supervised advisory Director reviews against In Review Stories.

The following environment variables configure the system:

- `STORYRAIL_DATABASE_URL`: PostgreSQL connection string.
- `STORYRAIL_CREDENTIAL_KEY`: 32-byte base64 key for encrypting stored credentials in `storyrail.site_credentials` (see `.env.example`).
- `STORYRAIL_SITE_ID`: optional default site identifier; if unset, `/` defaults to the first existing site or lets the operator create one.
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

Source-evidence, Story, attachment, triage, preparation, Agent Profile, Assignment, AgentRun, Article, Article Revision, Writer revision, review submission, review decision, Director review, Story rejection, tool calls, newsroom standards, archive search, site credentials, site settings, policy runs, web search, and story delivery persistence integration tests run against real PostgreSQL 18.4 (no mocks, testcontainers, or embedded databases). Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. The configured database name **must** be exactly `storyrail_test`. The suite never creates or drops a database, but it does drop and recreate the `storyrail` schema, applies migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, `0031`, `0038`, `0041`, `0049`, `0053`, `0054`, `0055`, `0056`, `0057`, `0058`, `0059`, `0060`, `0061`, `0062`, `0063`, `0064`, `0065`, `0066`, `0067`, `0068`, `0069`, `0070`, `0071`, `0072`, `0073`, `0074`, `0075`, and `0076` in order, truncates the editorial tables (and deletes non-built-in Agent Profiles) between cases.

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated `test:postgres` command fails before Vitest when the variable is absent.

## Task routing

| Change area or intent          | Wiki page                                                                                                                    | Source entry points                                                                                                                                | Important symbols                                                       | Focused tests                                                                        | Minimal validation               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| Sites & tenancy                | [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md), [Newsroom UI shell](architecture/newsroom-ui.md) | `src/domain/editorial/site-domain.ts`, `src/runtime/site-directory-runtime.ts`, `src/app/api/sites/route.ts`, `src/server/site-route.ts` | `createSite`, `createSiteDirectoryRuntime`, `withSite`, `createSiteHttpHandler` | `site-domain.test.ts`, `site-directory-provider.test.ts`, `site-route.test.ts`, `site-handlers.test.ts` | `pnpm test site`                 |
| Newsroom identity injection    | [Adapters and runtime](architecture/adapters-and-runtime.md), [Domain model](architecture/domain-model.md)                 | `src/runtime/newsroom-identity.ts`, `src/domain/editorial/newsroom-standards.ts`                                                                   | `withNewsroomContext`, `withNewsroomIdentity`, `NewsroomIdentity`       | `newsroom-identity.test.ts`, `newsroom-standards.test.ts`                            | `pnpm test newsroom-identity`    |
| Source intake / extraction     | [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md)                           | `src/adapters/source-extraction/firecrawl-source-extractor.ts`, `src/runtime/source-evidence-runtime.ts`, `src/app/api/sites/[siteId]/sources/[sourceId]/extractions/route.ts` | `firecrawlSourceExtractor`, `createSourceEvidenceRuntime`, `extractPersistedSource` | `firecrawl-source-extractor.test.ts`, `source-evidence-runtime.test.ts`              | `pnpm test source-evidence`      |
| Source extraction retry (UI)   | [Newsroom UI shell](architecture/newsroom-ui.md)                                                                             | `src/features/newsroom/source-evidence-workspace.tsx`, `src/features/newsroom/source-inbox-workspace.tsx`, `src/features/newsroom/source-inbox-client.ts` | `SourceEvidenceWorkspace`, `retryExtraction`, `retryableSource`         | `source-evidence-workspace.test.tsx`, `source-inbox-workspace.test.tsx`              | `pnpm test newsroom`             |
| Prepared Evidence              | [Application workflows](architecture/application-workflows.md)                                                               | `src/application/source-evidence-preparation/prepare-source-evidence.ts`, `src/runtime/evidence-preparation-runtime.ts`                            | `prepareSourceEvidence`, `createEvidencePreparationRuntime`             | `prepare-source-evidence.test.ts`                                                    | `pnpm test evidence-preparation` |
| Story / attachment / triage    | [Application workflows](architecture/application-workflows.md)                                                               | `src/application/story-creation/create-story.ts`, `src/application/source-triage/record-source-triage-decision.ts`, `src/runtime/story-runtime.ts` | `createStory`, `recordSourceTriageDecision`, `createStoryRuntime`       | `create-story.test.ts`, `record-source-triage-decision.test.ts`                      | `pnpm test story`                |
| Agent Profiles                 | [Domain model](architecture/domain-model.md), [HTTP API](architecture/http-api.md)                                           | `src/domain/editorial/agent-profile.ts`, `src/domain/editorial/built-in-agent-profiles.ts`, `src/application/agent-profiles/create-custom-writer-profile.ts` | `createAgentProfile`, `BUILT_IN_AGENT_PROFILES`, `createCreateCustomWriterProfile` | `agent-profile.test.ts`, `create-custom-writer-profile.test.ts`                      | `pnpm test agent-profile`        |
| Durable Assignments            | [Domain model](architecture/domain-model.md), [Application workflows](architecture/application-workflows.md)                 | `src/domain/editorial/assignment.ts`, `src/application/assignments/assign-story.ts`                                                                | `createAssignment`, `createAssignStory`                                 | `assignment.test.ts`, `assign-story.test.ts`                                         | `pnpm test assign`               |
| Assignment Editor proposals    | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/assignment-proposals/generate-assignment-proposal.ts`, `src/runtime/assignment-editor-runtime.ts`                                 | `createGenerateAssignmentProposal`, `createAssignmentEditorRuntime`     | `generate-assignment-proposal.test.ts`, `assignment-editor-runtime-provider.test.ts` | `pnpm test assignment-proposal`  |
| AgentRun records               | [Domain model](architecture/domain-model.md)                                                                                 | `src/domain/editorial/agent-run.ts`, `src/application/agent-runs/agent-run-repository.ts`                                                          | `recordAgentRun`, `AgentRunRepository`                                  | `agent-run.test.ts`, `agent-run-repository.test.ts`                                  | `pnpm test agent-run`            |
| Writer drafts / Article reader | [Domain model](architecture/domain-model.md), [Newsroom UI shell](architecture/newsroom-ui.md)                               | `src/domain/editorial/article.ts`, `src/application/writer-drafts/create-writer-draft.ts`, `src/features/newsroom/article-reader.tsx`               | `createFirstArticleRevision`, `createWriterDraft`, `ArticleReader`      | `article.test.ts`, `article-reader.test.tsx`, `story-plain-reading.test.tsx`         | `pnpm test article`              |
| Writer revisions               | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/writer-revisions/create-writer-revision.ts`, `src/runtime/writer-runtime.ts`                                                       | `createWriterRevision`, `resolveWriterModel`                            | `create-writer-revision.test.ts`                                                     | `pnpm test writer-revision`      |
| Review submission / Director   | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/review-submissions/submit-story-review.ts`, `src/application/director-reviews/run-director-review.ts`, `src/runtime/director-runtime.ts` | `createSubmitStoryReview`, `createRunDirectorReview`, `createDirectorRuntime` | `submit-story-review.test.ts`, `run-director-review.test.ts`                         | `pnpm test review`              |
| Review decisions / Rejection   | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/review-decisions/record-story-review-decision.ts`, `src/application/story-rejections/reject-story.ts`                             | `createRecordStoryReviewDecision`, `createRejectStory`                  | `record-story-review-decision.test.ts`, `reject-story.test.ts`                      | `pnpm test review-decision`      |
| Site credentials & settings    | [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md)                           | `src/adapters/credential-cipher/aes-gcm-credential-cipher.ts`, `src/adapters/site-credential-persistence/postgres-site-credential-repository.ts`, `src/application/site-settings/update-site-settings.ts` | `createAesGcmCredentialCipher`, `createPostgresSiteCredentialRepository`, `createUpdateSiteSettings` | `aes-gcm-credential-cipher.test.ts`, `site-settings-client.test.ts` | `pnpm test site-settings`        |
| Model catalog discovery      | [Adapters and runtime](architecture/adapters-and-runtime.md), [HTTP API](architecture/http-api.md)                           | `src/adapters/model-catalog/openrouter-model-catalog.ts`, `src/application/model-catalog/model-catalog.ts`                                         | `createOpenRouterModelCatalog`, `modelCatalogProvider`                  | `openrouter-model-catalog.test.ts`                                                   | `pnpm test model-catalog`        |
| Story delivery (StudioCMS/WordPress)| [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [Newsroom UI shell](architecture/newsroom-ui.md) | `src/adapters/story-delivery/wordpress-destination.ts`, `src/adapters/story-delivery/studiocms-destination.ts`, `src/application/story-deliveries/deliver-story.ts`, `src/features/newsroom/delivery-outcome.ts` | `createWordPressDestination`, `createStudioCmsDestination`, `createDeliverStory`, `deliveryOutcome` | `wordpress-destination.test.ts`, `studiocms-destination.test.ts`, `deliver-story.test.ts`, `story-delivery-workspace.test.tsx` | `pnpm test delivery`             |
| Newsroom standards           | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md) | `src/adapters/newsroom-standards-persistence/postgres-newsroom-standards-repository.ts`, `src/application/newsroom-standards/index.ts`            | `createPostgresNewsroomStandardsRepository`, `createNewsroomStandardsRepository` | `postgres-newsroom-standards-repository.test.ts`, `newsroom-standards-client.test.ts` | `pnpm test newsroom-standards`   |
| Archive search               | [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md)                                 | `src/application/archive/index.ts`, `src/application/archive/search-archive-tool.ts`, `src/adapters/archive/postgres-archive-repository.ts` | `createArchiveRepository`, `createSearchArchiveTool`, `createPostgresArchiveRepository` | `archive/index.test.ts`, `archive/search-archive-tool.test.ts`                       | `pnpm test archive`              |
| Tool calls & Activity stream | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md), [Domain model](architecture/domain-model.md), [Newsroom UI shell](architecture/newsroom-ui.md) | `src/adapters/agent-tool-call-persistence/postgres-agent-tool-call-repository.ts`, `src/features/newsroom/tool-activity.tsx`, `src/features/newsroom/tool-outcome.ts` | `createPostgresAgentToolCallRepository`, `ToolActivity`, `toolOutcome` | `postgres-agent-tool-call-repository.test.ts`, `story-tool-activity.test.tsx`, `tool-outcome.test.ts` | `pnpm test agent-tool-call` |
| Web search (SearXNG) & Research | [Adapters and runtime](architecture/adapters-and-runtime.md), [Application workflows](architecture/application-workflows.md) | `src/adapters/web-search/searxng-web-search.ts`, `src/application/web-search/web-search-tool.ts`, `src/runtime/researcher-runtime.ts` | `createSearxngWebSearch`, `createWebSearchTool`, `createResearcherRuntime` | `searxng-web-search.test.ts`, `web-search-tool.test.ts`, `research-story-sources.test.ts` | `pnpm test web-search` |
| Autopilot & Policy Runs        | [Application workflows](architecture/application-workflows.md), [HTTP API](architecture/http-api.md), [Domain model](architecture/domain-model.md) | `src/interfaces/http/autopilot-sequence.ts`, `src/application/policy-runs/reconcile-abandoned-work.ts`, `src/domain/editorial/policy-run.ts` | `createAutopilot`, `createReconcileAbandonedWork`, `recordPolicyRun` | `autopilot-sequence.test.ts`, `reconcile-abandoned-work.test.ts`, `policy-run.test.ts` | `pnpm test autopilot` |
| Story Rail navigation (UI)     | [Newsroom UI shell](architecture/newsroom-ui.md)                                                                             | `src/features/newsroom/story-rail.tsx`, `src/features/newsroom/story-rail-stops.ts`, `src/features/newsroom/story-rail-visibility.ts` | `StoryRail`, `resolveStoryRailStop`, `createStoryRailObserver` | `story-rail.test.tsx`, `story-rail-advance.test.tsx`, `story-rail-visibility.test.tsx` | `pnpm test newsroom` |
| Shared Domain Schemas & Decoders | [Domain model](architecture/domain-model.md), [Adapters and runtime](architecture/adapters-and-runtime.md)                 | `src/domain/editorial/schema-primitives.ts`, `src/domain/editorial/*-schema.ts`, `src/test/domain-enumerations-are-not-restated.test.ts` | `storySchema`, `agentRunSchema`, `articleSchema` | `domain-enumerations-are-not-restated.test.ts`, `postgres-agent-run-decoder.test.ts` | `pnpm test domain-enumerations` |
| PostgreSQL schema / migrations | [Database schema](architecture/database-schema.md)                                                                           | `database/migrations/*.sql`, `src/adapters/source-persistence/postgres-source-repositories.test.ts`                                                | migration setup + truncate guard                                        | `postgres-source-repositories.test.ts`                                               | `pnpm test:postgres`             |
| HTTP endpoints                 | [HTTP API](architecture/http-api.md)                                                                                         | `src/interfaces/http/*-handler.ts`, `src/app/api/sites/[siteId]/**/route.ts`                                                                       | `create*HttpHandler`, route `GET`/`POST`/`PUT` exports                  | `*-handler.test.ts`, `story-http-handlers.test.ts`                                   | `pnpm test http`                 |
| Newsroom UI                    | [Newsroom UI shell](architecture/newsroom-ui.md)                                                                             | `src/features/newsroom/newsroom-shell.tsx`, `story-workspace.tsx`, `site-switcher.tsx`                                                              | `NewsroomShell`, `StoryWorkspace`, `SiteSwitcher`                       | `newsroom-shell.test.tsx`, `story-delivery-workspace.test.tsx`, `site-switcher.test.tsx` | `pnpm test newsroom`             |

## Navigation

- [Architecture overview](architecture/overview.md) — layered hexagonal structure and the six composed runtimes.
- [Editorial domain model](architecture/domain-model.md) — Source, Story, Agent Profile, Assignment, Assignment Proposal, AgentRun, Director review, ReviewDecision, Article, and bounded Article Revision (1–3) domain rules.
- [Application workflows](architecture/application-workflows.md) — use-case orchestration and repository ports.
- [Adapters and runtime composition](architecture/adapters-and-runtime.md) — PostgreSQL, Firecrawl, and OpenRouter adapters composed into focused runtimes including the Director runtime.
- [HTTP API endpoints](architecture/http-api.md) — Next.js route handlers and status code maps.
- [PostgreSQL schema and migrations](architecture/database-schema.md) — the `storyrail` schema and migrations `0012`–`0076`.
- [Newsroom UI shell](architecture/newsroom-ui.md) — resizable desk, staff sidebar, Story workspace with assignment, writing, Writer revision, review submission, Director review, operator decision, and operator Story rejection, and SafeMarkdown.
- [Repository source map](architecture/source-map.md) — canonical file and directory locations.
- [Engineering workflow and testing](engineering-workflow.md) — branch/batch discipline, verification ownership, CI contract, and the testing strategy.

## Backlog

Ghost and Webhook delivery destinations remain planned. StudioCMS and WordPress delivery are fully implemented and verified.