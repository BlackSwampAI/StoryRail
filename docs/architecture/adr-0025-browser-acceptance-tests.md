# ADR 0025: Browser acceptance tests with stubbed external services

- Date: 2026-09-05
- Status: Accepted

## Context

Unit and PostgreSQL integration tests do not exercise the real page, Route Handlers, runtimes, and database together, so browser regressions could reach `main`. The newsroom's real workflows depend on model and CMS providers whose credentials and output cannot be assumed in CI.

## Decision

Add Playwright acceptance tests under `e2e/`, run with `pnpm test:e2e` and in CI. They drive the real newsroom in Chromium against a development Next.js server on port 3134 and a real PostgreSQL database, with one worker.

The database must be named exactly `storyrail_test`, and both the Playwright configuration and the reset script refuse anything else. Before each run the acceptance-owned schema and migration ledger are reset and the full migration history is replayed, so acceptance also exercises the migrations.

External services are replaced by one small local server (`e2e/support/external-services.mjs`) that answers OpenRouter-compatible completions with deterministic structured output and accepts WordPress post creation with a fixed Application Password. The application is pointed at it through `STORYRAIL_OPENROUTER_BASE_URL` and per-Site settings, so no provider credentials are needed. The first journeys cover a newsroom smoke test and a supervised editorial run from evidence through Director review, revision, publication, and WordPress delivery. Each test creates its own Site, so runs stay isolated.

## Consequences

Regressions in the wiring between browser, API, runtimes, and PostgreSQL are caught without external accounts. Model behavior is stubbed, so the tests prove workflow and persistence, not model quality or real provider compatibility. Contributors need Chromium and a disposable database.

## Rejected or deferred

- Calling real providers in CI.
- Running against a shared or development database.
- Parallel workers against one database.
- Broad coverage of every workflow, including Autopilot.
