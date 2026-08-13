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
| `.env.example`                                         | Database, operator, Firecrawl, OpenRouter, evidence-preparation, assignment-editor, writer, and director model variable names  |
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
- `agent-profile-types.ts`, `agent-profile.ts` — `createAgentProfile`, built-in/custom Writer profiles
- `assignment-types.ts`, `assignment.ts` — `createAssignment`
- `assignment-proposal-types.ts`, `assignment-proposal.ts` — `createAssignmentProposal`
- `agent-run-types.ts`, `agent-run.ts` — `recordAgentRun` (Assignment Editor, Writer draft/revision, and Director run validation)
- `director-review-types.ts`, `director-review.ts` — `createDirectorReview` (advisory recommendation validation)
- `review-decision-types.ts`, `review-decision.ts` — `createReviewDecision` (operator decision validation)
- `article-types.ts`, `article.ts` — `createArticle`, `createFirstArticleRevision`, `createArticleRevision`
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
- `agent-profiles/` — `agent-profile-repository.ts` (port), `create-custom-writer-profile.ts`, `.contract.ts`
- `assignments/` — `assign-story.ts`, `assignment-persistence.ts`
- `agent-runs/` — `agent-run-repository.ts` (port), `.contract.ts`
- `assignment-proposals/` — `generate-assignment-proposal.ts`
- `writer-drafts/` — `create-writer-draft.ts`, `writer-draft-persistence.ts`
- `writer-revisions/` — `create-writer-revision.ts`, `writer-revision-persistence.ts`
- `review-submissions/` — `submit-story-review.ts`, `review-submission-persistence.ts`
- `director-reviews/` — `run-director-review.ts`
- `review-decisions/` — `record-story-review-decision.ts`, `review-decision-persistence.ts`
- `index.ts` — barrel re-export

### `src/adapters` — PostgreSQL + Firecrawl implementations

- `source-extraction/` — `source-extractor.ts` (port), `firecrawl-source-extractor.ts`
- `source-persistence/` — `postgres-source-repositories.ts`, `postgres-source-extraction-decoder.ts`, `.test.ts`
- `source-inbox/` — `postgres-source-inbox-repository.ts`
- `source-triage-persistence/` — `postgres-source-triage-decision-repository.ts`
- `source-evidence-preparation-persistence/` — append-only PostgreSQL preparation repository and decoder
- `model/` — LangChain-backed OpenRouter structured-model adapter
- `agent-profile-persistence/` — `postgres-agent-profile-repository.ts`, `postgres-agent-profile-decoder.ts`
- `assignment-persistence/` — `postgres-assignment-persistence.ts`, `postgres-assignment-decoder.ts`
- `agent-run-persistence/` — `postgres-agent-run-repository.ts`, `postgres-agent-run-decoder.ts`
- `article-persistence/` — `postgres-writer-draft-persistence.ts`, `postgres-writer-revision-persistence.ts`, `postgres-article-decoder.ts`
- `review-persistence/` — `postgres-review-decision-persistence.ts`, `postgres-review-submission-persistence.ts`, `postgres-review-decision-decoder.ts`
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
- `assignment-editor-configuration.ts`, `assignment-editor-runtime.ts` — supervised Assignment Editor proposal runtime
- `writer-configuration.ts`, `writer-runtime.ts` — supervised Writer draft and revision runtime and model resolution
- `director-configuration.ts`, `director-runtime.ts` — supervised advisory Director review runtime and model resolution
- `index.ts` — barrel re-export

### `src/server` — lazy runtime providers

- `source-evidence-runtime-provider.ts`
- `evidence-preparation-runtime-provider.ts`
- `story-runtime-provider.ts`
- `assignment-editor-runtime-provider.ts`
- `writer-runtime-provider.ts`
- `director-runtime-provider.ts`

### `src/interfaces/http` — HTTP handlers

- `preserve-and-extract-url-source-handler.ts`
- `create-story-handler.ts`, `list-stories-handler.ts`, `inspect-story-handler.ts`
- `attach-source-to-story-handler.ts`
- `list-source-inbox-handler.ts`
- `record-source-triage-decision-handler.ts`
- `prepare-source-evidence-handler.ts`
- `list-agent-profiles-handler.ts`, `create-custom-writer-profile-handler.ts`
- `generate-assignment-proposal-handler.ts`
- `assign-story-handler.ts`
- `create-writer-draft-handler.ts`
- `create-writer-revision-handler.ts`
- `submit-story-review-handler.ts`
- `run-director-review-handler.ts`
- `record-story-review-decision-handler.ts`

### `src/app` — Next.js routes

- `page.tsx` → `<NewsroomShell />`; `layout.tsx`; `globals.css`
- `api/source-evidence/url/route.ts` (POST)
- `api/inbox/route.ts` (GET)
- `api/sources/[sourceId]/triage/route.ts` (PUT)
- `api/sources/[sourceId]/preparations/route.ts` (POST)
- `api/stories/route.ts` (GET, POST)
- `api/stories/[storyId]/route.ts` (GET)
- `api/stories/[storyId]/sources/route.ts` (POST)
- `api/stories/[storyId]/assignment-proposals/route.ts` (POST)
- `api/stories/[storyId]/assignments/route.ts` (POST)
- `api/stories/[storyId]/writer-drafts/route.ts` (POST)
- `api/stories/[storyId]/writer-revisions/route.ts` (POST)
- `api/stories/[storyId]/review-submissions/route.ts` (POST)
- `api/stories/[storyId]/director-reviews/route.ts` (POST)
- `api/stories/[storyId]/review-decisions/route.ts` (POST)
- `api/agent-profiles/route.ts` (GET, POST)

### `src/features/newsroom` — React UI

- `newsroom-shell.tsx`, `newsroom-shell.module.css`, `newsroom-state.ts`
- `resizable-newsroom-layout.tsx` — draggable desk/workspace split with persisted proportions
- `newsroom-staff.tsx` — Agent Profile roster and Writer drag sources
- `source-evidence-workspace.tsx`, `source-evidence-url-client.ts` — integrated intake → prepare → review flow
- `source-inbox-workspace.tsx`, `source-inbox-client.ts`
- `story-workspace.tsx` — Assignment, Writer execution, Writer revision, review submission, Director review, operator decision, and Article reading workspace
- `article-reader.tsx`, `safe-markdown.tsx` — dependency-free safe Markdown renderer for untrusted content
- `editorial-task-pending.tsx` — shared accessible pending-status card for Writer, Assignment Editor, and Director tasks
- `agent-profiles-workspace.tsx`, `agent-profile-client.ts`
- `story-client.ts`

### `src/test`

- `setup.ts` — vitest setup (jest-dom matchers)

## Database migrations (`database/migrations/`)

- `0012-source-evidence.sql` — `url_sources`, `source_extractions`
- `0017-durable-story-creation.sql` — `stories`
- `0018-durable-story-source-attachment.sql` — `story_source_attachments`
- `0024-source-triage-decisions.sql` — `source_triage_decisions`
- `0025-source-evidence-preparations.sql` — immutable prepared-evidence history
- `0027-agent-profiles.sql` — `agent_profiles` and built-in Assignment Editor, General Writer, and Director profiles
- `0028-durable-assignments.sql` — `story_assignments`, `story_transition_receipts`, disjoint-source validation functions
- `0030-agent-runs.sql` — `agent_runs` with Assignment Editor proposal input/outcome constraints
- `0031-articles-and-writer-drafts.sql` — extends `agent_runs` for Writer `article_draft` runs; creates `articles` and `article_revisions`
- `0038-supervised-director-review.sql` — extends `agent_runs` for Director `article_review` runs; creates `review_decisions`; adds `director_review_is_valid` and uniqueness constraints
- `0041-supervised-writer-revisions.sql` — extends `agent_runs` for Writer `article_revision` runs; broadens `article_revisions.revision_number` to 1–3; links revision runs to the authorizing `review_decisions` row via generated columns and a composite foreign key

## Documentation (`docs/`)

- `docs/product/` — `vision.md`, `terminology.md`, `mvp.md`
- `docs/architecture/` — `README.md` and ADRs `adr-0001` through `adr-0019`

## CI

- `.github/workflows/ci.yml` — runs format/lint/typecheck/test/test:postgres/build/diff-check on PRs to `main`, pushes to `main`, and manual dispatch, against PostgreSQL 18.4-alpine.
- `.github/workflows/openwiki-update.yml` — automated OpenWiki documentation update; triggers on push to `main` (ignoring `openwiki/**`, `AGENTS.md`, `CLAUDE.md`, and itself) and manual dispatch, runs `openwiki code --update`, and opens an `openwiki/update` pull request.
