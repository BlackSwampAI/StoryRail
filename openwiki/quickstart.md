---
type: Quickstart
title: StoryRail quickstart
description: How to install, run, and manually verify the StoryRail pre-alpha editorial control plane on a local development machine.
tags: [quickstart, setup, development]
---

# StoryRail quickstart

StoryRail is a pre-alpha, agent-first editorial control plane for solo publishers and small editorial teams. It is **not** ready for production use. The repository currently contains an implemented vertical slice from URL Source intake through Firecrawl extraction, optional Prepared Evidence, durable Story creation, Source-Source attachment, Story inspection, a pending Source inbox with manual triage, durable Agent Profiles, durable manual Assignments (with the first `intake` → `assigned` Story transition), supervised Assignment Editor proposals, supervised Writer execution that creates the first Article and immutable Revision 1 (with the `assigned` → `in_progress` transition), and the newsroom workbench that ties them together. Revision, Director review, approval, rejection, and publishing remain planned.

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

StoryRail composes five independent server-only runtimes, each owning its own `pg.Pool`:

- **Source-evidence runtime** — `STORYRAIL_DATABASE_URL`, `FIRECRAWL_API_KEY`.
- **Evidence-preparation runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_EVIDENCE_PREPARATION_MODEL`.
- **Story runtime** — `STORYRAIL_DATABASE_URL` only. Owns Story, attachment, inspection, listing, inbox, triage, Agent Profile, and manual Assignment workflows.
- **Assignment-editor runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, `STORYRAIL_ASSIGNMENT_EDITOR_MODEL`. Generates supervised Assignment Editor proposals.
- **Writer runtime** — `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and either a per-Profile OpenRouter model or `STORYRAIL_WRITER_MODEL` as the default. Creates the first Article draft.

`STORYRAIL_OPERATOR_ID` attributes intake, preparation, attachment, triage, assignment, proposal, and writer actions to the fixed development operator; it is not authentication. Normal Story, Inbox, triage, inspection, Agent Profile, and manual Assignment workflows do not require Firecrawl or OpenRouter. `.env.example` documents names only; never commit credentials or connection strings.

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

Source-evidence, Story, attachment, triage, preparation, Agent Profile, Assignment, AgentRun, Article, and Article Revision persistence integration tests run against real PostgreSQL 18.4 (no mocks, testcontainers, or embedded databases). Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. The configured database name **must** be exactly `storyrail_test`. The suite never creates or drops a database, but it does drop and recreate the `storyrail` schema, applies migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, and `0031` in order, truncates the editorial tables (and deletes non-built-in Agent Profiles) between cases.

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated `test:postgres` command fails before Vitest when the variable is absent.

## Task routing

| Change area or intent | Wiki page | Source entry points | Important symbols | Focused tests | Minimal validation |
| --- | --- | --- | --- | --- | --- |
| Source intake / extraction | [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/adapters/source-extraction/firecrawl-source-extractor.ts`, `src/runtime/source-evidence-runtime.ts` | `firecrawlSourceExtractor`, `createSourceEvidenceRuntime` | `firecrawl-source-extractor.test.ts`, `source-evidence-runtime.test.ts` | `pnpm test source-evidence` |
| Prepared Evidence | [Application workflows](architecture/application-workflows.md) | `src/application/source-evidence-preparation/prepare-source-evidence.ts`, `src/runtime/evidence-preparation-runtime.ts` | `prepareSourceEvidence`, `createEvidencePreparationRuntime` | `prepare-source-evidence.test.ts` | `pnpm test evidence-preparation` |
| Story / attachment / triage | [Application workflows](architecture/application-workflows.md) | `src/application/story-creation/create-story.ts`, `src/application/source-triage/record-source-triage-decision.ts`, `src/runtime/story-runtime.ts` | `createStory`, `recordSourceTriageDecision`, `createStoryRuntime` | `create-story.test.ts`, `record-source-triage-decision.test.ts` | `pnpm test story` |
| Agent Profiles | [Domain model](architecture/domain-model.md), [HTTP API](architecture/http-api.md) | `src/domain/editorial/agent-profile.ts`, `src/application/agent-profiles/create-custom-writer-profile.ts` | `createAgentProfile`, `createCreateCustomWriterProfile` | `agent-profile.test.ts`, `create-custom-writer-profile.test.ts` | `pnpm test agent-profile` |
| Durable Assignments | [Domain model](architecture/domain-model.md), [Application workflows](architecture/application-workflows.md) | `src/domain/editorial/assignment.ts`, `src/application/assignments/assign-story.ts` | `createAssignment`, `createAssignStory` | `assignment.test.ts`, `assign-story.test.ts` | `pnpm test assign` |
| Assignment Editor proposals | [Application workflows](architecture/application-workflows.md), [Adapters and runtime](architecture/adapters-and-runtime.md) | `src/application/assignment-proposals/generate-assignment-proposal.ts`, `src/runtime/assignment-editor-runtime.ts` | `createGenerateAssignmentProposal`, `createAssignmentEditorRuntime` | `generate-assignment-proposal.test.ts`, `assignment-editor-runtime-provider.test.ts` | `pnpm test assignment-proposal` |
| AgentRun records | [Domain model](architecture/domain-model.md) | `src/domain/editorial/agent-run.ts`, `src/application/agent-runs/agent-run-repository.ts` | `recordAgentRun`, `AgentRunRepository` | `agent-run.test.ts`, `agent-run-repository.test.ts` | `pnpm test agent-run` |
| Writer drafts / Articles | [Domain model](architecture/domain-model.md), [Application workflows](architecture/application-workflows.md) | `src/domain/editorial/article.ts`, `src/application/writer-drafts/create-writer-draft.ts`, `src/runtime/writer-runtime.ts` | `createFirstArticleRevision`, `createWriterDraft`, `resolveWriterModel` | `article.test.ts`, `create-writer-draft.test.ts` | `pnpm test writer-draft` |
| PostgreSQL schema / migrations | [Database schema](architecture/database-schema.md) | `database/migrations/*.sql`, `src/adapters/source-persistence/postgres-source-repositories.test.ts` | migration setup + truncate guard | `postgres-source-repositories.test.ts` | `pnpm test:postgres` |
| HTTP endpoints | [HTTP API](architecture/http-api.md) | `src/interfaces/http/*-handler.ts`, `src/app/api/**/route.ts` | `create*HttpHandler`, route `GET`/`POST`/`PUT` exports | `*-handler.test.ts`, `story-http-handlers.test.ts` | `pnpm test http` |
| Newsroom UI | [Newsroom UI shell](architecture/newsroom-ui.md) | `src/features/newsroom/newsroom-shell.tsx`, `story-workspace.tsx` | `NewsroomShell`, `StoryWorkspace` | `newsroom-shell.test.tsx`, `story-writer-drop.test.tsx` | `pnpm test newsroom` |

## Navigation

- [Architecture overview](architecture/overview.md) — layered hexagonal structure and the five composed runtimes.
- [Editorial domain model](architecture/domain-model.md) — Source, Story, Agent Profile, Assignment, Assignment Proposal, AgentRun, and Article domain rules.
- [Application workflows](architecture/application-workflows.md) — use-case orchestration and repository ports.
- [Adapters and runtime composition](architecture/adapters-and-runtime.md) — PostgreSQL, Firecrawl, and OpenRouter adapters composed into focused runtimes.
- [HTTP API endpoints](architecture/http-api.md) — Next.js route handlers and status code maps.
- [PostgreSQL schema and migrations](architecture/database-schema.md) — the `storyrail` schema and migrations `0012`–`0031`.
- [Newsroom UI shell](architecture/newsroom-ui.md) — resizable desk, staff sidebar, Story workspace, and SafeMarkdown.
- [Repository source map](architecture/source-map.md) — canonical file and directory locations.
- [Engineering workflow and testing](engineering-workflow.md) — branch/batch discipline, verification ownership, CI contract, and the testing strategy.

## Backlog

No deferred areas. All implemented vertical-slice components are documented above.
