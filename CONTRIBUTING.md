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
