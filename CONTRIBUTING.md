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
- `pnpm test` runs the focused Vitest suite once.
- `pnpm test:postgres` runs only the PostgreSQL persistence integration suite for Source evidence, Stories, and Story-Source attachments and requires `STORYRAIL_TEST_DATABASE_URL`.
- `pnpm test:watch` runs Vitest in watch mode.
- `pnpm typecheck` generates Next.js route and framework types, then checks strict TypeScript types without emitting files.
- `pnpm lint` runs ESLint.
- `pnpm format` writes Prettier formatting changes.
- `pnpm format:check` checks formatting without writing changes.

Agents may write or update the code, tests, and configuration behind these commands, but only Chris executes installation and validation. Handoffs must give Chris an ordered command sequence beginning with `pnpm install --frozen-lockfile` before project checks.

## Server runtime configuration

The server-only Source-evidence runtime requires these production variable names:

- `STORYRAIL_DATABASE_URL`
- `FIRECRAWL_API_KEY`

The separate server-only Story runtime requires only `STORYRAIL_DATABASE_URL`; Story creation, Source attachment, and Story inspection do not require Firecrawl.

`.env.example` documents names only. Never commit credentials, connection strings, or working example values. Runtime unit tests inject Pool, fetch, UUID, and clock substitutes, so they require no real PostgreSQL or Firecrawl access. PostgreSQL migrations must be applied externally before a composed runtime can persist Source evidence or Story state; application runtime does not execute them. Ordinary validation must never make Firecrawl, other provider, or production database requests.

## PostgreSQL integration tests

Source-evidence, Story, and Story-Source attachment persistence integration tests run against PostgreSQL 18.4 itself. They do not use mocks, testcontainers, an embedded database, or a simulated PostgreSQL implementation.

Provide the test-only connection through `STORYRAIL_TEST_DATABASE_URL`. Never use a production `DATABASE_URL`. The configured database name must be exactly `storyrail_test`; the suite connects and verifies that name before any destructive setup. It never creates or drops a database, but it does drop and recreate the `storyrail` schema, applies migrations 0012, 0017, and 0018 in order, and truncates the two evidence tables, Stories table, and Story-Source attachment table between cases. Use a disposable local test database with no data outside this test workflow that depends on the `storyrail` schema.

When `STORYRAIL_TEST_DATABASE_URL` is absent, `pnpm test` skips the PostgreSQL suite while continuing to run every non-PostgreSQL test. The dedicated command fails before Vitest when the variable is absent. Run the integration suite explicitly with a test URL whose database component is `storyrail_test`:

```bash
STORYRAIL_TEST_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/storyrail_test' \
  pnpm test:postgres
```

Credentials, host, and port may differ locally. Do not commit connection strings or credentials. The integration suite owns and closes only the Pool it creates; the server-only application runtime separately owns only the Pool created for its own composed instance.

## Continuous integration

Before contributing a pull request, run the same validation contract locally in this order:

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

GitHub Actions runs these commands independently for pull requests targeting `main`. CI also runs for
pushes to `main` and can be started manually. A green CI run confirms the automated checks passed for
that revision; it does not replace Chris's explicit approval to merge.

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
