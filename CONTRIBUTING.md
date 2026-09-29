# Contributing to StoryRail

StoryRail is pre-alpha. Keep changes narrow, reviewable, and grounded in the documented editorial model.

## Branch and batch workflow

Use one numbered batch and one concern per branch. Begin from a current, clean `main`, then create a descriptive branch such as:

- `chore/0001-project-foundation`
- `feat/0003-editorial-domain`
- `fix/0004-specific-problem`

Do not mix unrelated cleanup into a batch.

Agents are responsible for verifying that each batch branch originates from current `main`. They may inspect Git state, fetch remotes, perform fast-forward-only pulls, switch or create branches, stage scoped changes, create commits, push feature branches, and open pull requests when the verification gate below permits it. Never stage or include unrelated user changes.

Force pushes, resets, rebases, amends, branch deletion, discarding user changes, and other destructive or history-rewriting operations require explicit approval.

## Implementation and verification

The workflow is:

1. An agent implements the scoped change and adds or updates appropriate tests when behavior changes.
2. The agent provides exact verification commands but does not run tests, lint, typecheck, builds, coverage, audits, end-to-end tests, formatting checks, link checks, or any other validation.
3. Chris runs the commands and reports the results.
4. Before Chris reports success, the agent does not create the final implementation commit, push the feature branch, or open a pull request.
5. On failure, the agent stays on the same branch, fixes only the relevant failure, updates tests when appropriate, and provides revised manual verification instructions.
6. After all requested verification passes, the agent inspects the branch and working tree, stages only the approved batch files, creates an intentional Conventional Commit, pushes the feature branch, and opens a pull request targeting `main`.
7. The agent reports the commit SHA and pull request URL. Merging still requires Chris's explicit approval.

When application code begins, behavior changes are expected to include focused tests. Regression fixes should include a test that demonstrates the corrected behavior. Chris remains responsible for running all tests and validation.

## Application commands

The single application package uses pnpm scripts:

- `pnpm dev` starts the local Next.js development server.
- `pnpm build` creates the production build.
- `pnpm start` serves an existing production build.
- `pnpm migrate` applies pending PostgreSQL schema migrations.
- `pnpm migrate:status` reports migration status without applying migrations.
- `pnpm migrate:adopt` records existing migrations as applied without executing them.
- `pnpm test` runs the focused Vitest suite once.
- `pnpm test:postgres` runs the PostgreSQL persistence and schema migration integration suites and requires `STORYRAIL_TEST_DATABASE_URL`.
- `pnpm test:e2e` runs Playwright browser acceptance tests and requires `STORYRAIL_TEST_DATABASE_URL` for a disposable `storyrail_test` database.
- `pnpm test:watch` runs Vitest in watch mode.
- `pnpm typecheck` generates Next.js route and framework types, then checks strict TypeScript types without emitting files.
- `pnpm lint` runs ESLint.
- `pnpm format` writes Prettier formatting changes.
- `pnpm format:check` checks formatting without writing changes.

Agents may write or update the code, tests, and configuration behind these commands, but only Chris executes installation and validation. Handoffs must give Chris an ordered command sequence beginning with `pnpm install --frozen-lockfile` before project checks.

## Server runtime configuration

The server runtime reads its configuration from the variable names documented in `.env.example`:

- `STORYRAIL_DATABASE_URL`
- `STORYRAIL_OPENROUTER_BASE_URL` (optional)
- `STORYRAIL_FIRECRAWL_BASE_URL` (optional)
- `STORYRAIL_CREDENTIAL_KEY` (for encrypted site credentials)
- `STORYRAIL_SITE_ID` (optional; selects a Site when an installation has more than one)
- `STORYRAIL_OPERATOR_ID` (required for actions attributed to an operator)

Provider credentials such as Firecrawl and OpenRouter keys are managed as site credentials in the application, rather than through `FIRECRAWL_API_KEY` environment configuration. `.env.example` documents names only. Never commit credentials, connection strings, or working example values. Unit tests inject external services and require no production database or provider access. PostgreSQL migrations must be applied before a composed runtime can persist editorial state; application runtime does not run them automatically.

Ordinary validation must not make requests to production databases or external providers.

## PostgreSQL integration tests

PostgreSQL integration tests run against PostgreSQL 18.4 itself. They do not use mocks, testcontainers, an embedded database, or a simulated PostgreSQL implementation.

Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. Never use a production database URL. The configured database name must be exactly `storyrail_test`. These tests are destructive: persistence tests drop and recreate the `storyrail` schema, while migration-runner tests create and drop a separate `storyrail_migration_runner_test` database. Use a disposable PostgreSQL instance and a test role with the permissions those operations require; do not point either suite at data you need to keep.

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated command fails before Vitest when the variable is absent. Run the integration suite explicitly with a test URL whose database component is `storyrail_test`:

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

Credentials, host, and port may differ locally. Do not commit connection strings or credentials.

Browser acceptance tests use the same `STORYRAIL_TEST_DATABASE_URL` and require Chromium. They reset the test database's `storyrail` schema and migration ledger, then apply the complete migration history before starting the application. Install the browser once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. Use only a disposable `storyrail_test` database.

## Continuous integration

Before contributing a pull request, run the same validation contract locally in this order:

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' pnpm test:postgres
pnpm exec playwright install --with-deps chromium
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' pnpm test:e2e
pnpm build
git diff --check
```

GitHub Actions runs these checks for pull requests targeting `main`, pushes to `main`, and manual
workflow dispatch. OpenWiki is not part of CI and is run manually when a maintainer wants to refresh
the generated documentation index.

pnpm dependency lifecycle scripts fail closed until reviewed. Record each approval in the committed `pnpm-workspace.yaml` `allowBuilds` map with an exact package version; never approve an unversioned package or all dependency builds. A version change requires a new script review before installation can proceed.

Use Conventional Commits for commit messages, for example `feat: add editorial state transitions` or `docs: define source terminology`.

## Pull requests

A pull request description should state:

- what changed;
- why it changed;
- scope boundaries;
- tests added or changed;
- manual verification performed; and
- known limitations.

## Reporting verification failures

Return the following information without omitting relevant error context:

```text
Branch:
Command:
Exit code:
Failing test or check:
Relevant complete error output:
Runtime versions (when relevant):
git status --short --branch:
```
