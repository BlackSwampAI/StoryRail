---
type: Quickstart
title: StoryRail quickstart
description: How to install, run, and manually verify the StoryRail pre-alpha editorial control plane on a local development machine.
tags: [quickstart, setup, development]
---

# StoryRail quickstart

StoryRail is a pre-alpha, agent-first editorial control plane for solo publishers and small editorial teams. It is **not** ready for production use. The repository currently contains an implemented Source-intake, evidence-preparation, triage, and Story-management vertical slice, not a complete editorial workflow.

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

Open <http://localhost:3000>. The page should identify StoryRail as a pre-alpha editorial control plane. Source Intake preserves and extracts a URL; the resulting Source then moves to Source Inbox, where an operator may optionally prepare evidence before creating a new Story, attaching to an existing Story, or skipping coverage. The newsroom shell also loads persisted Stories and their authoritative inspections.

## Runtime configuration

The server-only Source-evidence runtime reads two production variables:

- `STORYRAIL_DATABASE_URL`
- `FIRECRAWL_API_KEY`

The separate server-only Story runtime requires only `STORYRAIL_DATABASE_URL`; Story creation, Source attachment, and Story inspection do not require Firecrawl. `STORYRAIL_OPERATOR_ID` attributes intake, preparation, attachment, and triage actions to the fixed development operator. Manual Prepared Evidence additionally requires `OPENROUTER_API_KEY` and `STORYRAIL_EVIDENCE_PREPARATION_MODEL`; ordinary Story and Inbox workflows do not require OpenRouter. `.env.example` documents names only; never commit credentials or connection strings.

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

Source-evidence, Story, and Story-Source attachment persistence integration tests run against real PostgreSQL 18.4 (no mocks, testcontainers, or embedded databases). Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. The configured database name **must** be exactly `storyrail_test`. The suite never creates or drops a database, but it does drop and recreate the `storyrail` schema, applies migrations `0012`, `0017`, `0018`, `0024`, and `0025` in order, and truncates the evidence tables, Stories table, and Story-Source attachment table between cases.

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated `test:postgres` command fails before Vitest when the variable is absent.

See [engineering workflow](engineering-workflow.md) for the branch/batch/verification discipline and [HTTP API](architecture/http-api.md) for the implemented endpoints.
