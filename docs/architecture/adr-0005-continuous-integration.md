# ADR 0005: GitHub Actions continuous integration

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

StoryRail has a pinned application toolchain and a defined local validation suite, but pull requests
and changes reaching `main` need an independent, repeatable check in the repository's hosting
environment. The first continuous integration pipeline should reproduce the existing validation
contract without adding deployment, release, or repository-governance responsibilities.

## Decision

StoryRail uses GitHub Actions for continuous integration because the source repository and pull
request workflow already live on GitHub. This keeps the initial automation visible beside each pull
request and avoids introducing a separate CI service or additional credentials.

The `CI` workflow runs for pull requests targeting `main`, pushes to `main`, and manual
`workflow_dispatch` requests. It contains one Ubuntu-hosted job named `Quality`, uses the exact Node.js
version in `.nvmrc`, and installs the exact pnpm version declared by `package.json`.

The validation contract is this ordered sequence, with each check exposed as its own workflow step:

1. `pnpm install --frozen-lockfile`
2. `pnpm format:check`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build`
7. `git diff --check`

Workflow permissions are explicitly limited to read access for repository contents. The workflow
does not request, inject, or expose secrets, and checkout credentials are not persisted for later
steps.

The supported cache integration in `actions/setup-node` caches pnpm's package data using the committed
`pnpm-lock.yaml` as its dependency key. It does not cache `node_modules`, and installation remains
locked by `--frozen-lockfile`.

Workflow-level concurrency groups are keyed by workflow and pull request number or Git ref. A newer
run in the same group cancels an obsolete in-progress run. The job has a 20-minute timeout so stalled
work does not consume a runner indefinitely.

Every external action reference is pinned to the full commit SHA for a documented stable release,
with an adjacent version comment for maintainability. Updating an action requires deliberate review of
the new release and its immutable commit.

Chris's local verification remains the pre-publication gate: Chris runs the documented commands and
reports success before an agent may commit, push, or open a pull request. GitHub Actions then performs
independent verification after the branch is pushed, on the pull request, and again for changes pushed
or merged to `main`. A successful CI run does not authorize automatic merging or deployment. Merge
approval remains an explicit decision by Chris.

## Consequences

Pull requests and `main` receive a consistent check using the repository's pinned runtime, package
manager, lockfile, and scripts. The stable `Quality` job name can be referenced in review and in future
repository policy without expanding this batch into branch-protection configuration.

CI adds runner time and depends on GitHub Actions availability. Cache entries improve repeated install
performance but do not replace the lockfile or frozen installation. SHA pinning reduces exposure to a
mutable action tag but requires explicit maintenance to adopt action updates.

This workflow reports validation results only. It does not merge pull requests, publish artifacts,
deploy StoryRail, create releases, upload coverage, or change repository settings.

## Alternatives considered

- **A separate CI provider:** Rejected for the initial pipeline because it would add another service,
  credential boundary, and integration despite the repository already using GitHub pull requests.
- **A job matrix:** Deferred until StoryRail needs to support multiple operating systems, Node.js
  versions, or package configurations.
- **Coverage and test-result services:** Deferred until reporting requirements justify additional
  permissions, data handling, and service dependencies.
- **Required checks and branch protection:** Deferred because repository governance settings are
  separate from defining the validation workflow.
- **Deployment and release workflows:** Deferred until deployment targets and release policy are
  selected in later architecture decisions.
