---
type: Reference
title: Repository source map
description: Canonical file and directory locations for StoryRail's domain, application, adapters, runtime, HTTP interface, Next.js routes, newsroom UI, database migrations, and engineering configuration.
tags: [source-map, repository, files]
---

# Repository source map

StoryRail is a single-package Next.js application (`package.json`: `name: storyrail`, private, ESM, `type: module`). Source lives under `src/`; documentation under `docs/`; migrations under `database/migrations/`.

## Root configuration

| File                                                   | Purpose                                                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `package.json`                                         | pnpm scripts, dependencies (next 16.3, react 19.2, pg 8.23), dev deps (vitest 4, eslint 9, prettier 3, typescript 6) |
| `pnpm-workspace.yaml`                                  | `allowBuilds` map for reviewed dependency build scripts; `minimumReleaseAgeExclude` for `pg`/`pg-protocol`           |
| `tsconfig.json`                                        | strict TS, `ES2022`, `moduleResolution: Bundler`, path alias `@/*` → `./src/*`, JSX `react-jsx`                      |
| `next.config.ts`                                       | empty `NextConfig`                                                                                                   |
| `vitest.config.ts`                                     | jsdom environment, `@` alias, `src/**/*.test.{ts,tsx}`, setup `./src/test/setup.ts`                                  |
| `eslint.config.mjs`                                    | next core-web-vitals + TypeScript configs; ignores build/cache output                                                |
| `.prettierrc.json`, `.prettierignore`, `.editorconfig` | formatting                                                                                                           |
| `.nvmrc`                                               | Node 24.18.0                                                                                                         |
| `.env.example`                                         | Database, operator, Firecrawl, OpenRouter, and evidence-preparation model variable names                             |
| `.gitignore`                                           | env, node_modules, build output, caches                                                                              |
| `AGENTS.md`, `CLAUDE.md`                               | agent operating instructions (do not edit during wiki runs)                                                          |

## Source tree (`src/`)

### `src/domain/editorial` — pure domain

- `types.ts` — branded identifiers, `Story`, `StoryState`, `EditorialActor`, transition result/error types
- `state-machine.ts` — `PERMITTED_STORY_TRANSITIONS`, `MAX_REVISION_CYCLES`, `transitionStory`
- `source-types.ts` — `UrlSource`, `CanonicalSourceUrl`, intake/error types
- `source-url.ts` — `canonicalizeSourceUrl`
- `source-intake.ts` — `intakeUrlSource`
- `source-extraction-types.ts`, `source-extraction.ts` — extraction records and `recordSourceExtraction`
- `source-triage-types.ts`, `source-triage.ts` — `decideSourceTriage`
- `source-evidence-preparation-types.ts`, `source-evidence-preparation.ts` — immutable Prepared Evidence attempts
- `story-creation-types.ts`, `story-creation.ts` — `createStory`
- `story-source-attachment-types.ts`, `story-source-attachment.ts` — `attachSourceToStory`
- `index.ts` — barrel re-export

### `src/application` — use-case workflows + repository ports

- `source-evidence/` — `preserve-url-source.ts`, `extract-persisted-source.ts`, `preserve-and-extract-url-source.ts`
- `source-evidence-preparation/` — explicit model-backed preparation workflow and persistence port
- `model/` — provider-neutral structured-model port
- `source-extraction/` — `run-source-extraction.ts`
- `source-persistence/` — `source-repositories.ts` (ports), `source-repositories.contract.ts` (contract harness)
- `source-inbox/` — `source-inbox-repository.ts` (port)
- `source-triage/` — `record-source-triage-decision.ts`, `source-triage-repository.ts` (port)
- `story-creation/` — `create-story.ts`
- `story-persistence/` — `story-repository.ts` (port), `.contract.ts`
- `story-source-attachment/` — `attach-source-to-story.ts`
- `story-source-persistence/` — `story-source-attachment-repository.ts` (port), `.contract.ts`
- `story-inspection/` — `story-inspection-repository.ts` (port), `.contract.ts`
- `story-listing/` — `story-listing-repository.ts` (port), `.contract.ts`
- `index.ts` — barrel re-export

### `src/adapters` — PostgreSQL + Firecrawl implementations

- `source-extraction/` — `source-extractor.ts` (port), `firecrawl-source-extractor.ts`
- `source-persistence/` — `postgres-source-repositories.ts`, `postgres-source-extraction-decoder.ts`, `.test.ts`
- `source-inbox/` — `postgres-source-inbox-repository.ts`
- `source-triage-persistence/` — `postgres-source-triage-decision-repository.ts`
- `source-evidence-preparation-persistence/` — append-only PostgreSQL preparation repository and decoder
- `model/` — LangChain-backed OpenRouter structured-model adapter
- `story-persistence/` — `postgres-story-repository.ts`
- `story-source-persistence/` — `postgres-story-source-attachment-repository.ts`
- `story-inspection/` — `postgres-story-inspection-repository.ts`
- `story-listing/` — `postgres-story-listing-repository.ts`, `.test.ts`
- `index.ts` — barrel re-export

### `src/runtime` — composed runtimes

- `source-evidence-configuration.ts` — env validation
- `source-evidence-runtime.ts` — `createSourceEvidenceRuntime` / `...FromEnvironment`
- `evidence-preparation-runtime.ts` and configuration — explicit OpenRouter preparation composition
- `story-runtime.ts` — `createStoryRuntime` / `...FromEnvironment`
- `index.ts` — barrel re-export

### `src/server` — lazy runtime providers

- `source-evidence-runtime-provider.ts`
- `evidence-preparation-runtime-provider.ts`
- `story-runtime-provider.ts`

### `src/interfaces/http` — HTTP handlers

- `preserve-and-extract-url-source-handler.ts`
- `create-story-handler.ts`, `list-stories-handler.ts`, `inspect-story-handler.ts`
- `attach-source-to-story-handler.ts`
- `list-source-inbox-handler.ts`
- `record-source-triage-decision-handler.ts`
- `prepare-source-evidence-handler.ts`

### `src/app` — Next.js routes

- `page.tsx` → `<NewsroomShell />`; `layout.tsx`; `globals.css`
- `api/source-evidence/url/route.ts` (POST)
- `api/source-inbox/route.ts` (GET)
- `api/sources/[sourceId]/triage/route.ts` (PUT)
- `api/sources/[sourceId]/preparations/route.ts` (POST)
- `api/stories/route.ts` (GET, POST)
- `api/stories/[storyId]/route.ts` (GET)
- `api/stories/[storyId]/sources/route.ts` (POST)

### `src/features/newsroom` — React UI

- `newsroom-shell.tsx`, `newsroom-shell.module.css`, `newsroom-state.ts`
- `source-evidence-workspace.tsx`, `source-evidence-url-client.ts`
- `source-inbox-workspace.tsx`, `source-inbox-client.ts`
- `story-client.ts`

### `src/test`

- `setup.ts` — vitest setup (jest-dom matchers)

## Database migrations (`database/migrations/`)

- `0012-source-evidence.sql` — `url_sources`, `source_extractions`
- `0017-durable-story-creation.sql` — `stories`
- `0018-durable-story-source-attachment.sql` — `story_source_attachments`
- `0024-source-triage-decisions.sql` — `source_triage_decisions`
- `0025-source-evidence-preparations.sql` — immutable prepared-evidence history

## Documentation (`docs/`)

- `docs/product/` — `vision.md`, `terminology.md`, `mvp.md`
- `docs/architecture/` — `README.md` and ADRs `adr-0001` through `adr-0019`

## CI

- `.github/workflows/ci.yml` — runs format/lint/typecheck/test/test:postgres/build/diff-check on PRs to `main`, pushes to `main`, and manual dispatch, against PostgreSQL 18.4-alpine.
