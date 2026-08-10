# StoryRail

[![CI](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml)

> Turn raw sources into researched, reviewed, publishable stories through a visible agentic editorial workflow.

**Status: pre-alpha. StoryRail is not ready for production use.** The repository contains a minimal application foundation, not an implemented editorial workflow.

## Why StoryRail

Small publishers need more than a stream of links or an opaque text generator. They need a durable editorial process that preserves evidence, makes automated work reviewable, and keeps publication under human control. StoryRail is an agent-first editorial control plane for that process, not a page-building CMS.

The core terms are deliberately separate:

- A **Source** is preserved evidence or input, such as a URL and its extracted contents.
- A **Story** is an editorial object used to assess, organize, assign, and track a possible piece of coverage.
- An **Article** is a versioned editorial work product that may be reviewed and eventually published.

Multiple sources can inform one story, and a story can be rejected or merged without ever becoming an article.

## Editorial lifecycle

StoryRail's intended lifecycle is: preserve sources, form a story, create an assignment, research and draft, review claims and prose, request bounded revisions, approve or reject, then publish or export through an explicit action.

## Core principles

- Human operators supervise exceptions and exercise editorial judgment.
- Originality, evidence, and provenance matter throughout the workflow.
- Automation is bounded, observable, and auditable.
- Editorial state is explicit and durable.
- Models, source extractors, and publication targets remain replaceable.
- Publishing is headless and API-oriented rather than tied to page building.

## Documentation

- [Product vision](docs/product/vision.md)
- [Terminology and invariants](docs/product/terminology.md)
- [MVP vertical slice](docs/product/mvp.md)
- [Architecture decisions](docs/architecture/README.md)
- [ADR 0001: Editorial control plane](docs/architecture/adr-0001-editorial-control-plane.md)
- [ADR 0002: Application toolchain](docs/architecture/adr-0002-application-toolchain.md)
- [ADR 0005: GitHub Actions continuous integration](docs/architecture/adr-0005-continuous-integration.md)
- [Contributing](CONTRIBUTING.md)

## Application development

Prerequisites:

- Node.js 24.18.0
- pnpm 11.20.0 through Corepack

Install the pinned dependencies and start the development server:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). The page should identify StoryRail as a pre-alpha editorial control plane. Its newsroom queues load persisted Stories and the connected Source-intake workflow can preserve and extract a URL, create a Story, attach the Source, and load the authoritative Story inspection.

Copy `.env.example` to `.env` and provide `STORYRAIL_DATABASE_URL`, `FIRECRAWL_API_KEY`, and `STORYRAIL_OPERATOR_ID` for the existing local workflows. Manual evidence preparation additionally requires `OPENROUTER_API_KEY` and an operator-selected `STORYRAIL_EVIDENCE_PREPARATION_MODEL`; normal Story, Inbox, triage, and raw Source intake do not require OpenRouter. Apply database migrations externally in order, including `database/migrations/0025-source-evidence-preparations.sql`; the application does not run migrations automatically.

Manual verification is maintainer-owned. Run the project checks in this order:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
pnpm dev
```

Agents add or update tests when behavior changes, but do not execute these commands.

## License

StoryRail is licensed under the [GNU Affero General Public License version 3](LICENSE).
