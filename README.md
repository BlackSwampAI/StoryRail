# StoryRail

[![CI](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml)

> An agent-first editorial control plane that turns incoming evidence into deliberate, reviewable publishing work.

StoryRail helps solo publishers and small editorial teams preserve source evidence, decide what deserves coverage, organize Stories, and coordinate bounded, supervised editorial agents. It is a headless editorial system, not a page-building CMS.

**Status: pre-alpha and under active development. StoryRail is not production-ready.**

## What is StoryRail?

StoryRail separates evidence acquisition, editorial decisions, writing, review, and publication into explicit stages with durable state and human supervision.

Its central distinction is **Source ≠ Story**:

- A **Source** is incoming evidence, such as a submitted URL and its extraction history.
- A **Story** is an editorial decision to pursue and organize coverage.
- An **Article** is a durable, versioned editorial work product separate from its Story. Supervised Writer execution creates the first Article and immutable Revision 1.

One Story may draw on many Sources. A Source may be skipped or attached to an existing Story; submitting a URL never creates a Story automatically.

## Why StoryRail?

Traditional CMS products begin with an article editor. StoryRail begins earlier:

```text
source evidence → editorial decision → Story → assignment → writing → review → publication
```

Small teams need to preserve provenance, make automation inspectable, and keep editorial and publishing decisions under operator control. The current pre-alpha exposes those primitives manually before automating them with agents.

## Current workflow

```mermaid
flowchart LR
    URL[Submitted URL] --> FC[Firecrawl extraction]
    FC --> RAW[Immutable raw evidence]
    RAW --> INBOX[Source Inbox]
    INBOX -. optional .-> PREP[Prepared Evidence]
    PREP --> DECIDE{Editorial decision}
    INBOX --> DECIDE
    DECIDE -->|New Story| NEW[Persisted Story + Source]
    DECIDE -->|Existing Story| EXISTING[Attach Source to Story]
    DECIDE -->|Skip| SKIP[Durable skip decision]
    NEW --> PROPOSE[Optional supervised Assignment Editor suggestion]
    EXISTING --> PROPOSE
    PROPOSE --> REVIEW[Operator review and editing]
    REVIEW --> ASSIGN[Durable Assignment + intake-to-assigned transition]
```

Prepared Evidence is model-derived, cleaned evidence. It never replaces the immutable raw extraction; both histories remain available for audit and survive triage and reload.

Durable Profiles configure the Assignment Editor, Writer, and Director/editor-in-chief roles. The Assignment Editor can produce a supervised suggestion for an Intake Story. The operator reviews or edits it, then creates the durable Assignment. From Assigned, the operator may run the exact assigned Writer. That bounded execution uses only Assignment evidence, records a durable Writer AgentRun, creates the first Article and immutable Revision 1, and atomically moves the Story to In Progress. Revision, Director execution, approval, and publishing remain planned.

## What works today

- URL Source preservation with conservative canonicalization and exact-duplicate detection.
- Firecrawl v2 Markdown extraction using its automatic proxy strategy.
- Rejection of obvious challenge/interstitial responses as failed extraction attempts.
- Immutable, append-ordered raw extraction history, including durable failures and retries.
- A PostgreSQL-backed Source Inbox with durable **New Story**, **Existing Story**, and **Skip** triage.
- Persistent Story queues, Story creation, Source-to-Story attachments, and Story inspection.
- Manual Prepared Evidence generation through a provider-neutral model boundary, LangChain, and OpenRouter.
- Immutable successful and failed preparation history alongside the original raw evidence.
- Reconstruction of raw and prepared evidence from PostgreSQL after triage or browser reload.
- Immutable, PostgreSQL-backed Agent Profiles with built-in Assignment Editor, General Writer, and Director configurations plus custom Writer creation and optional provider-neutral model selection.
- Durable manual Assignments with Writer selection from immutable Agent Profiles and a server-derived snapshot of every attached Source identity.
- The first persisted Story transition, `intake` to `assigned`, committed atomically with its Assignment and durable transition receipt/activity.
- Supervised Assignment Editor proposal generation through the provider-neutral structured-model boundary, with no browsing or tools.
- Durable, append-ordered AgentRun history that records the exact Story, evidence references, Writer candidates, model, prompt version, requester, outcome, and proposal or safe failure.
- Supervised Writer execution with Assignment-selected identity, Profile model override or `STORYRAIL_WRITER_MODEL` default, durable Article Revision 1, and an `assigned` to `in_progress` transition.
- Operator review and editing of suggestions in the existing Assignment form; the manual Assignment remains the authoritative state-mutation boundary and remains attributed to the operator.

## Where StoryRail is going

The planned alpha path continues from a Story through an Assignment Editor, a structured Assignment, a configurable Writer, a persisted Article, and independent Director/editor-in-chief review. The intended bounded revision loop ends in an operator-controlled approval or rejection, followed by a separate, explicit publish/export transition.

Automatic Assignment Editor decisions, Writer revision, and Director execution are not operational today. Future work includes the review/request-changes loop, approval, rejection, publication, and retrieval hardening.

## Core concepts

- **Source** — preserved incoming evidence. A URL Source retains the exact submitted URL and a conservative canonical URL.
- **Raw Extraction** — an immutable Firecrawl success or failure record. Retries append new records rather than overwrite history.
- **Prepared Evidence** — an immutable model-derived attempt to clean a successful raw extraction. It is optional and never authoritative over raw evidence.
- **Source Inbox** — the queue of preserved Sources awaiting a final editorial decision.
- **Triage Decision** — an attributable, durable choice to create a Story, attach to an existing Story, or skip coverage.
- **Story** — the central editorial object that groups evidence and will carry work through the editorial lifecycle.
- **Agent Profile** — an immutable configuration snapshot for a bounded editorial persona and optional provider-neutral model selection; profiles do not execute agents.
- **Assignment** — an immutable operator-created brief that selects a Writer Profile, records angle/brief/optional constraints and provenance, and snapshots attached Source identities.
- **Assignment Proposal** — a supervised Assignment Editor suggestion that prefills the manual Assignment form but cannot create an Assignment or transition a Story.
- **AgentRun** — one immutable execution record containing bounded input references, configuration, timing, and a structured success or failure outcome.
- **Writer and Article** — supervised Writer execution creates the first durable Article revision from the Assignment; it cannot browse, use tools, revise, or send work to review.
- **Director** — a future independently supervised review role; no Director execution is implemented.

## Architecture

StoryRail is a Next.js 16 / React 19 application backed by PostgreSQL. Its domain and application layers define provider-neutral editorial rules and ports; external systems are attached through replaceable adapters. Firecrawl is the current extraction adapter, while LangChain and OpenRouter provide the current structured-model path for Prepared Evidence.

PostgreSQL is authoritative for editorial state. Source extractions, evidence preparations, attachments, triage decisions, Assignments, and Story transition receipts preserve auditable facts rather than relying on agent memory or overwriting history.

See the [OpenWiki architecture overview](openwiki/architecture/overview.md) for deeper code-grounded documentation, or browse the [technical documentation index](openwiki/index.md).

## Getting started

### Prerequisites

- Node.js 24 (`package.json` requires `>=24.15.0 <25`; `.nvmrc` pins 24.18.0)
- pnpm 11.20.0 through Corepack
- PostgreSQL with an application database you control
- A Firecrawl API key for URL extraction
- An OpenRouter API key and model name only if you want to prepare evidence

### Install and run

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
```

Before starting the app, configure `.env` and apply every SQL file in `database/migrations/` externally in numeric order. StoryRail does not currently include a migration runner and does not apply migrations automatically; use the PostgreSQL administration or migration tool appropriate to your environment.

Open [http://localhost:3000](http://localhost:3000) to use the development newsroom.

## Environment variables

| Variable                               | Required for                      | Purpose                                                                        |
| -------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `STORYRAIL_DATABASE_URL`               | All persisted workflows           | PostgreSQL connection string for editorial state.                              |
| `STORYRAIL_OPERATOR_ID`                | Operator-attributed HTTP actions  | Identifies the current fixed development operator; this is not authentication. |
| `FIRECRAWL_API_KEY`                    | URL intake/extraction             | Authenticates Firecrawl v2 requests.                                           |
| `OPENROUTER_API_KEY`                   | Model-backed workflows            | Authenticates the current OpenRouter model adapter.                            |
| `STORYRAIL_EVIDENCE_PREPARATION_MODEL` | Prepared Evidence only            | Selects the OpenRouter model used for evidence preparation.                    |
| `STORYRAIL_ASSIGNMENT_EDITOR_MODEL`    | Assignment Editor only            | Explicitly selects the OpenRouter model used for supervised proposals.         |
| `STORYRAIL_WRITER_MODEL`               | Writer default                    | Used when the assigned Writer Profile has no OpenRouter model.                 |
| `STORYRAIL_TEST_DATABASE_URL`          | PostgreSQL integration tests only | Points to a disposable database named exactly `storyrail_test`.                |

Normal Story, Inbox, triage, inspection, Agent Profile, and manual Assignment workflows do not require Firecrawl or OpenRouter. Writer execution is isolated: a Profile's OpenRouter model wins, otherwise `STORYRAIL_WRITER_MODEL` is required. Missing Writer configuration does not affect normal workflows.

## Development and validation

Available project scripts:

```bash
pnpm dev
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:postgres
pnpm build
```

`pnpm test:postgres` requires `STORYRAIL_TEST_DATABASE_URL`. See [OpenWiki's engineering workflow](openwiki/engineering-workflow.md) and [CONTRIBUTING.md](CONTRIBUTING.md) for the full maintainer-owned verification sequence.

## Project status and limitations

StoryRail is a development-oriented pre-alpha. It currently has no authentication, migrations are external/manual, and some anti-bot publishers remain inaccessible through Firecrawl. Supervised Assignment proposals, manual Assignment, supervised first-draft Writer execution, and durable Article Revision 1 are implemented. Revision, review, approval, rejection, and publishing are not.

## Technical documentation

The generated [OpenWiki documentation](openwiki/index.md) provides deeper, code-grounded coverage of the architecture, domain model, workflows, persistence schema, HTTP API, newsroom UI, and engineering workflow. Human-authored product direction lives under [`docs/product/`](docs/product/), and architectural decisions are indexed under [`docs/architecture/`](docs/architecture/README.md).

## License

StoryRail is licensed under the [GNU Affero General Public License version 3](LICENSE).
