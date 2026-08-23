# StoryRail

[![CI](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BlackSwampAI/StoryRail/actions/workflows/ci.yml)

> An agentic editorial system where evidence, claims, model actions, review decisions, and publication provenance are inspectable and mechanically constrained instead of merely prompted.

StoryRail helps solo publishers and small editorial teams preserve source evidence, decide what deserves coverage, organize Stories, and run bounded editorial agents whose work can be checked rather than trusted. It is a headless editorial system, not a page-building CMS.

Plenty of tools can chain a researcher, a writer, and an editor together. What is unusual here is that the chain is held to its evidence: a reader can open any claim and see the passage that supports it, a Writer that cites something the evidence does not contain is refused before anything is written, a Director cannot approve work without quoting the passage it judged, and every external tool call becomes part of the durable record.

**Status: pre-alpha and under active development. StoryRail is not production-ready.**

## What is StoryRail?

StoryRail separates evidence acquisition, editorial decisions, writing, review, and publication into explicit stages with durable state and human supervision.

The constraints are mechanical rather than prompted. An Article is an ordered list of blocks, and a block that asserts a fact must carry the Source, the evidence record, and the passage it relied on. That passage is checked against the evidence before anything is persisted, in the domain and again in a database constraint, so an unsupported claim is as impossible to record as an invalid state transition.

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

Small teams need to preserve provenance, make automation inspectable, and keep editorial and publishing decisions under operator control. Every stage can be driven by hand; automation is an operator-authorised policy over the same durable workflows, never a separate path around them.

## Current workflow

```mermaid
flowchart LR
    URL[Submitted URL] --> FC[Firecrawl extraction]
    FC --> RAW[Immutable raw evidence]
    RAW -->|successful extraction| PREP[Automatic Prepared Evidence]
    RAW -->|failed extraction| INBOX[Source Inbox]
    PREP --> EVIDENCE_REVIEW[Evidence review]
    EVIDENCE_REVIEW --> INBOX
    INBOX --> DECIDE{Editorial decision}
    DECIDE -->|New Story| NEW[Persisted Story + Source]
    DECIDE -->|Existing Story| EXISTING[Attach Source to Story]
    DECIDE -->|Skip| SKIP[Durable skip decision]
    NEW --> RESEARCH[Optional Researcher: retrieve and attach more Sources]
    EXISTING --> RESEARCH
    RESEARCH --> PROPOSE[Optional supervised Assignment Editor suggestion]
    PROPOSE --> ASSIGNMENT_REVIEW[Operator review and editing]
    ASSIGNMENT_REVIEW --> ASSIGN[Durable Assignment + intake-to-assigned transition]
    ASSIGN --> WRITE[Supervised Writer + Article Revision 1]
    WRITE --> GROUND{Every claim supported by its cited evidence?}
    GROUND -->|No| CORRECT[One citation correction, then refusal]
    GROUND -->|Yes| SUBMIT[Article sent to review]
    SUBMIT --> DIRECTOR[Director review, quoting what it judged]
    DIRECTOR --> OPERATOR{Review decision}
    OPERATOR -->|Approve| APPROVED[Approved]
    OPERATOR -->|Request changes| CHANGES[Changes requested]
    CHANGES --> REVISE[Supervised Writer + next immutable revision]
    REVISE --> GROUND
    APPROVED --> PUBLISH[Operator publication + terminal transition]
```

Every step above can be taken by hand. **Autopilot** runs the same sequence unattended from an Intake Story, optionally researching first, writing each durable record through the same workflows with the operator as the actor.

Prepared Evidence is model-derived, cleaned evidence. It never replaces the immutable raw extraction; both histories remain available for audit and survive triage and reload.

Durable Profiles configure the Assignment Editor, Writer, and Director/editor-in-chief roles. After the supervised Writer creates an immutable revision, the operator explicitly submits it to review, runs the Director, and records an approval or request-changes decision. A request-changes decision lets the Writer create the next immutable revision from the exact historical evidence, Director review, and authoritative operator reason. The Director is advisory, and the existing two-cycle Story limit bounds Articles at Revision 3.

## What works today

- URL Source preservation with conservative canonicalization and exact-duplicate detection.
- Firecrawl v2 Markdown extraction using its automatic proxy strategy.
- Rejection of obvious challenge/interstitial responses as failed extraction attempts.
- Immutable, append-ordered raw extraction history, including durable failures and retries.
- A PostgreSQL-backed Source Inbox with durable **New Story**, **Existing Story**, and **Skip** triage.
- Persistent Story queues, Story creation, Source-to-Story attachments, and Story inspection.
- Automatic Prepared Evidence generation after successful new extraction, plus explicit append-only preparation retries through a provider-neutral model boundary, LangChain, and OpenRouter.
- Immutable successful and failed preparation history alongside the original raw evidence.
- Reconstruction of raw and prepared evidence from PostgreSQL after triage or browser reload.
- Immutable, PostgreSQL-backed Agent Profiles with built-in Assignment Editor, General Writer, and Director configurations plus custom Writer creation and optional provider-neutral model selection.
- Durable manual Assignments with Writer selection from immutable Agent Profiles and a server-derived snapshot of every attached Source identity.
- The first persisted Story transition, `intake` to `assigned`, committed atomically with its Assignment and durable transition receipt/activity.
- Supervised Assignment Editor proposal generation through the provider-neutral structured-model boundary, with no browsing or tools.
- Durable, append-ordered AgentRun history that records the exact Story, evidence references, Writer candidates, model, prompt version, requester, outcome, and proposal or safe failure.
- Supervised Writer execution with Assignment-selected identity, Profile model override or `STORYRAIL_WRITER_MODEL` default, durable Article Revision 1, and an `assigned` to `in_progress` transition.
- Supervised review submission, a durable Director AgentRun against the exact evidence IDs recorded by the Writer run, and an operator-owned ReviewDecision that atomically moves the Story to Approved or Changes Requested.
- Explicit operator rejection from Intake, Assigned, In Progress, In Review, or Changes Requested, with a required reason and an atomic terminal Story transition receipt.
- Supervised Writer revisions after Request Changes, with immutable Revision 2/3 history, exact evidence reuse, operator-owned revision direction, and an atomic return to In Progress.
- Operator review and editing of suggestions in the existing Assignment form; the manual Assignment remains the authoritative state-mutation boundary and remains attributed to the operator.
- Operator publication of an Approved Story as a durable terminal transition with a required reason.
- **Cited Articles.** A Revision is an ordered list of blocks. A `claim` block must carry at least one citation naming the Source, the evidence record, and the passage relied on; `context` blocks are the Writer's own prose and carry none. Both rules hold in the domain and in database constraints.
- **Mechanical grounding.** Every quote is checked against the evidence the Assignment actually carries before anything is persisted. Typography, re-wrapping, and over-escaping are forgiven; paraphrase, invention, and quoting across a paragraph break are not. A refused draft records which citations failed and what they claimed to quote.
- **One citation correction.** A Writer whose citations do not hold is handed the specific findings against it and may correct them once, checked again by the same rule. A corrected draft is recorded as corrected, never as clean.
- **Grounding measurement.** Every Revision reports how much of its prose is attributed to evidence and how much occurs verbatim in that evidence, derived on demand so it applies to Revisions written before citations existed.
- **A provenance reader.** Any claim in the Article opens to show the passage it rests on, the Source as a followable link, and whether the record read was prepared or raw. Uncited prose is labelled as the Writer's own framing.
- **A Director that must point at what it read.** Six checks including claim support, each required to quote the passage of the Article it judges, verified against that Article before the review is recorded.
- **A working record.** Runs, transitions, and review decisions interleaved in the order they happened, with the model, duration, and — for a refusal — the exact passages that could not be supported.
- **Bounded tool access.** Tools declare themselves through an open registry with JSON Schema, so an operator's own tools can be added. Two ceilings bound an exchange, calls are recorded durably, and tool output is handed to models as untrusted data.
- **A Researcher.** Reads the evidence already attached, follows what it points at, retrieves those pages, and attaches what is worth citing. Only a page it actually retrieved can be attached, and retrieved material becomes a Source with its own immutable extraction.
- **A newsroom that remembers.** The Researcher can search what StoryRail has already published, by subject, and is shown the earlier reporting with the Sources behind it. Prior reporting is deliberately not evidence: it carries no evidence record, so a citation naming it is refused by the same grounding check as any other unsupported citation.
- **Autopilot.** An operator-authorised policy that runs an Intake Story to publication unattended, optionally researching first. Every durable record is still written by the same workflows with the operator as the actor, and every reason says the decision was made under autopilot.

## Where StoryRail is going

The editorial path from Source to publication is implemented end to end and can run unattended. The work ahead is durability, curation, and delivery rather than new stages:

- **Durable automation and reconciliation.** Autopilot sequencing is still in-memory. Nothing durable records that a Story is under a policy run, so a process that dies between steps leaves a run marked `running` forever. Tool calls are recorded after the external call rather than before it. Both need the treatment AgentRuns already got.
- **A correction-scope invariant.** The citation correction turn is told not to rewrite unrelated blocks; nothing yet enforces it.
- **Richer automation provenance.** An autopilot decision is attributed to the operator who authorised the run, with a reason that says so. A distinct execution mode would let an audit separate "Chris authorised this" from "the system executed this particular decision."
- **A knowledge corpus.** House style as instructions, and reference knowledge as citable evidence, kept deliberately distinct so a Writer can never cite the style guide as support for a news claim.
- **Publishing destinations.** Publication is a durable editorial transition today; where a published Story is delivered remains a separate, replaceable concern.

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
- **Writer and Article** — supervised Writer execution creates immutable Article revisions from the Assignment and exact durable evidence; it cannot browse, use tools, or send work to review.
- **Director** — an independently supervised advisory review role whose recommendation cannot mutate Article or Story state, and which must quote the passage each of its checks judged.
- **Article Block** — one ordered piece of a Revision, labelled `claim`, `context`, or `heading`. The label decides whether attribution is required or forbidden.
- **Citation** — the Source, the evidence record, and the verbatim passage a claim rests on, stored so support can be checked rather than trusted.
- **Grounding** — the mechanical check that every cited passage appears in the evidence it names, owned by the Source it names. It runs before anything durable is written.
- **Researcher** — a bounded role that retrieves further evidence for a Story and attaches what is worth citing, recording every tool call it makes.
- **Tool Call** — a durable record of what an agent reached for and what came back. It is an audit fact, not a copy of the material, which becomes evidence with its own record.
- **Autopilot** — an operator-authorised policy that runs the existing workflows in sequence without further clicks. It decides only when each step runs; it writes nothing itself.

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

Every migration is plain SQL and safe to apply with any tool. Where no host `psql` is available, the installed `pg` package can apply them in order:

```bash
STORYRAIL_DATABASE_URL=postgresql://user:password@127.0.0.1:5432/storyrail \
  node --input-type=module --eval "import { readdir, readFile } from 'node:fs/promises'; import pg from 'pg'; const files = (await readdir('database/migrations')).filter((name) => name.endsWith('.sql')).sort(); const client = new pg.Client({ connectionString: process.env.STORYRAIL_DATABASE_URL }); await client.connect(); try { for (const file of files) { await client.query(await readFile(\`database/migrations/\${file}\`, 'utf8')); console.log('applied', file); } } finally { await client.end(); }"
```

Open [http://localhost:3133](http://localhost:3133) to use the development newsroom. StoryRail runs on port 3133 so it does not collide with other local services on the usual Next.js default.

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
| `STORYRAIL_DIRECTOR_MODEL`             | Director default                  | Used when the built-in Director Profile has no OpenRouter model.               |
| `STORYRAIL_TEST_DATABASE_URL`          | PostgreSQL integration tests only | Points to a disposable database named exactly `storyrail_test`.                |

Normal Story, Inbox, triage, inspection, Agent Profile, and manual Assignment workflows do not require Firecrawl or OpenRouter. Writer and Director execution are isolated. Each Profile's explicit OpenRouter model wins; otherwise its `STORYRAIL_WRITER_MODEL` or `STORYRAIL_DIRECTOR_MODEL` fallback is required. The resolved model is recorded in the durable AgentRun and is not exposed as browser configuration.

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

StoryRail is a development-oriented pre-alpha. It has no authentication, migrations are external and manual, and some anti-bot publishers remain inaccessible through Firecrawl.

The editorial path is implemented from Source intake through research, assignment, cited drafting, review, and publication, and can run unattended. Autopilot is now a durable record with a reconciliation pass that closes out work whose process disappeared, and a tool call is recorded before it reaches outside rather than after. What remains is delivery: StoryRail has no publishing destination and no way to read an archive other than its own. Free and low-cost models also fail a meaningful share of the time; StoryRail records those failures rather than retrying silently, so an unattended run may stop partway with a durable reason.

## Technical documentation

The generated [OpenWiki documentation](openwiki/index.md) provides deeper, code-grounded coverage of the architecture, domain model, workflows, persistence schema, HTTP API, newsroom UI, and engineering workflow. Human-authored product direction lives under [`docs/product/`](docs/product/), and architectural decisions are indexed under [`docs/architecture/`](docs/architecture/README.md).

## License

StoryRail is licensed under the [GNU Affero General Public License version 3](LICENSE).
