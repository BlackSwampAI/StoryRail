---
type: Reference
title: Engineering workflow and testing
description: Branch-and-batch contribution discipline, verification ownership, CI contract, and the Vitest testing strategy with unit and PostgreSQL integration suites.
tags: [engineering, workflow, testing, ci, verification]
---

# Engineering workflow and testing

StoryRail is pre-alpha. Contributions follow a strict branch-and-batch discipline with maintainer-owned verification, documented in `AGENTS.md` and `CONTRIBUTING.md`.

## Branch and batch workflow

- Work in small, numbered batches branched from an updated `main`, one concern per branch and pull request.
- Use numbered branch names such as `chore/0001-project-foundation`, `feat/0003-editorial-domain`, `fix/0004-specific-problem`.
- Before starting a batch, verify the branch originates from current `main`.
- Never stage, include, discard, or otherwise modify unrelated user changes.
- Destructive or history-rewriting operations (force pushes, resets, rebases, amends, branch deletion, discarding user changes) require explicit approval.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.).

## Verification ownership

Agents implement changes and add/update tests when behavior changes, but **do not execute** tests, lint, typecheck, builds, coverage, audits, end-to-end tests, formatting checks, link checks, or any other validation. Maintainers own all verification execution.

An agent's implementation turn ends with:

- a summary of changes;
- files changed;
- tests added or changed;
- exact commands maintainers should run;
- the expected successful result;
- the failure information maintainers should return; and
- an explicit statement that no tests or validation were run.

Before a maintainer reports successful verification, the agent does not create the final implementation commit, push the feature branch, or open a pull request. On failure, the agent stays on the same branch, fixes only the relevant failure, and provides revised verification instructions. After verification passes, the agent stages only the approved batch files, creates a Conventional Commit, pushes, and opens a PR targeting `main`. Merging always requires a maintainer's explicit approval.

## Application commands

| Command                             | Purpose                                                                                |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Next.js dev server                                                                     |
| `pnpm build`                        | production build                                                                       |
| `pnpm start`                        | serve an existing production build                                                     |
| `pnpm test`                         | Vitest once (skips PostgreSQL suite when `STORYRAIL_TEST_DATABASE_URL` is absent)      |
| `pnpm test:postgres`                | PostgreSQL persistence integration suite only (requires `STORYRAIL_TEST_DATABASE_URL`) |
| `pnpm test:watch`                   | Vitest watch mode                                                                      |
| `pnpm typecheck`                    | `next typegen && tsc --noEmit`                                                         |
| `pnpm lint`                         | ESLint                                                                                 |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                                                 |

Handoffs must give maintainers an ordered command sequence beginning with `pnpm install --frozen-lockfile` before project checks.

## Local verification order

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' pnpm test:postgres
pnpm build
git diff --check
```

## Continuous integration

`.github/workflows/ci.yml` runs the same contract independently for PRs targeting `main`, pushes to `main`, and manual dispatch. It provisions PostgreSQL 18.4-alpine as a service (`storyrail_test` database), installs with `--frozen-lockfile`, and runs format-check, lint, typecheck, test, `test:postgres`, build, and `git diff --check`. A green CI run confirms the automated checks passed for that revision; it does not replace a maintainer's explicit approval to merge.

pnpm dependency lifecycle scripts fail closed until reviewed. Each approval is recorded in `pnpm-workspace.yaml`'s `allowBuilds` map with an exact package version; a version change requires a new script review.

## OpenWiki documentation workflow

`.github/workflows/openwiki-update.yml` automates refresh of the generated `openwiki/` directory. It triggers on pushes to `main` (ignoring changes under `openwiki/**`, `AGENTS.md`, `CLAUDE.md`, and the workflow file itself) and on manual dispatch. It checks out full history (`fetch-depth: 0`) so OpenWiki can diff `HEAD` against the commit it last documented in `openwiki/.last-update.json`, installs `openwiki` globally, runs `openwiki code --update --print` with the OpenRouter provider, and opens an `openwiki/update` pull request through `peter-evans/create-pull-request`. The workflow never runs on PR branches; it only produces a documentation PR after changes land on `main`. Per `AGENTS.md`, OpenWiki is automatically refreshed by GitHub Actions after qualifying `main`-branch changes; implementation agents must not run it as part of ordinary change work. Generated pages should not be hand-edited; prefer updating source code and docs and letting this workflow regenerate the wiki.

## Testing strategy

- **Unit tests** (`src/**/*.test.{ts,tsx}`) run under Vitest with jsdom. Runtime and HTTP handler tests inject `Pool`, `fetch`, UUID, and clock substitutes, so they require no real PostgreSQL or Firecrawl access. Domain tests exercise the pure state machine and validation functions directly.
- **Contract harnesses** (`*.contract.ts`) verify that any repository implementation satisfies the same behavior contract. The PostgreSQL adapter tests run these contracts against real PostgreSQL.
- **PostgreSQL integration tests** (`src/adapters/source-persistence/postgres-source-repositories.test.ts` and the Story/attachment/triage/preparation/assignment/run/article/review/writer-revision/story-rejection suites) run against real PostgreSQL 18.4 — no mocks, testcontainers, or embedded databases. The suite connects via `STORYRAIL_TEST_DATABASE_URL`, verifies the database name is exactly `storyrail_test`, drops and recreates the `storyrail` schema, applies migrations `0012`, `0017`, `0018`, `0024`, `0025`, `0027`, `0028`, `0030`, `0031`, `0038`, and `0041` in order, and truncates the editorial tables (and deletes non-built-in Agent Profiles) between cases. It never creates or drops a database. Use a disposable local test database with no data outside this workflow that depends on the `storyrail` schema.

## Pull request descriptions

A PR should state: what changed; why it changed; scope boundaries; tests added or changed; manual verification performed; and known limitations.

## Reporting verification failures

Return, without omitting relevant error context:

```text
Branch:
Command:
Exit code:
Failing test or check:
Relevant complete error output:
Runtime versions (when relevant):
git status --short --branch:
```
