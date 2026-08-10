---
type: Architecture Overview
title: StoryRail architecture overview
description: Layered Next.js application organized as a hexagonal editorial control plane with domain, application, adapter, runtime, HTTP interface, and newsroom UI layers.
tags: [architecture, overview, hexagonal]
---

# StoryRail architecture overview

StoryRail is an open-source, agent-first editorial control plane. It is deliberately **not** a page-building CMS. It manages editorial state and publishes through replaceable adapters; Postgres is intended to be authoritative for editorial state, and agent memory must never become the database.

## Core editorial model

Three terms are kept strictly distinct (see `docs/product/terminology.md` and `AGENTS.md`):

- **Source** — preserved evidence or input, such as a URL and its extracted contents.
- **Story** — the central editorial object used to assess, organize, assign, and track coverage.
- **Article** — a versioned editorial work product that may be reviewed and eventually published.

Multiple Sources can inform one Story, and a Story can be rejected or merged without ever becoming an Article.

## Layered (hexagonal) structure

The codebase under `src/` is organized as a hexagonal architecture with the domain at the center and replaceable adapters on the outside:

<!-- openwiki: mermaid parse failed and this diagram was converted to a text fence so it does not break rendering. Fix the diagram source and restore the mermaid fence. Parser error: Heuristic: an unescaped angle bracket inside a label breaks rendering; rephrase the label. -->

```text
flowchart TD
    UI["Newsroom UI<br/>src/features/newsroom"]
    HTTP["HTTP Interface<br/>src/interfaces/http"]
    APP["Application workflows<br/>src/application"]
    DOM["Domain<br/>src/domain/editorial"]
    ADP["Adapters<br/>src/adapters"]
    RT["Runtime composition<br/>src/runtime"]
    SRV["Server providers<br/>src/server"]
    PG[("PostgreSQL<br/>storyrail schema")]

    UI --> HTTP
    HTTP --> SRV
    SRV --> RT
    RT --> APP
    APP --> DOM
    RT --> ADP
    ADP --> PG
```

| Layer            | Path                    | Responsibility                                                                                          |
| ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Domain           | `src/domain/editorial`  | Pure editorial types, validation, and the Story state machine. No I/O.                                  |
| Application      | `src/application`       | Use-case workflows that orchestrate domain rules with repository ports.                                 |
| Adapters         | `src/adapters`          | PostgreSQL persistence and Firecrawl extraction implementations of the ports.                           |
| Runtime          | `src/runtime`           | Composes adapters and application services into focused frozen runtimes with injectable external seams. |
| Server providers | `src/server`            | Lazy singletons that build runtimes from environment on first use.                                      |
| HTTP interface   | `src/interfaces/http`   | Hand-rolled request/response handlers that validate JSON and map workflow results to status codes.      |
| Next.js routes   | `src/app/api`           | Thin Next.js route handlers binding HTTP handlers to providers.                                         |
| Newsroom UI      | `src/features/newsroom` | React client shell with Source-evidence, Source-inbox, and Story workspaces.                            |

## Three composed runtimes

StoryRail composes three independent runtimes rather than one global container:

1. **Source-evidence runtime** (`src/runtime/source-evidence-runtime.ts`) — requires `STORYRAIL_DATABASE_URL` and `FIRECRAWL_API_KEY`. Owns one `pg.Pool`. Exposes `preserveUrlSource`, `extractPersistedSource`, and the combined `preserveAndExtractUrlSource`.
2. **Evidence-preparation runtime** (`src/runtime/evidence-preparation-runtime.ts`) — requires `STORYRAIL_DATABASE_URL`, `OPENROUTER_API_KEY`, and `STORYRAIL_EVIDENCE_PREPARATION_MODEL`. Uses LangChain's OpenRouter adapter to create one immutable Prepared Evidence attempt from a successful raw extraction.
3. **Story runtime** (`src/runtime/story-runtime.ts`) — requires only `STORYRAIL_DATABASE_URL`. Owns a separate `pg.Pool`. Exposes Story creation, Source attachment, Story inspection, Story listing, pending Source inbox listing, and Source triage decision recording.

Each runtime owns and closes only the `Pool` it creates. The integration test suite and a composed server runtime each own their own pools independently.

## Editorial lifecycle

The intended lifecycle (see `docs/product/vision.md`): preserve sources, form a Story, create an assignment, research and draft, review claims and prose, request bounded revisions, approve or reject, then publish or export through an explicit action.

The implemented vertical slice currently covers URL Source preservation and Firecrawl extraction, optional model-backed Prepared Evidence, durable Story creation, Story-Source attachment, Story inspection/listing read models, a pending Source inbox, and manual Source triage decisions. Assignment, writing, review, Article, and publishing workflows remain planned. See the [domain model](domain-model.md) and [HTTP API](http-api.md) for what is actually implemented.

## Core principles

- Human operators supervise exceptions and exercise editorial judgment.
- Originality, evidence, and provenance matter throughout the workflow.
- Automation is bounded, observable, and auditable.
- Editorial state is explicit and durable.
- Models, source extractors, and publication targets remain replaceable.
- Publishing is headless and API-oriented rather than tied to page building.

See the [source map](source-map.md) for exact file locations and [engineering workflow](../engineering-workflow.md) for contribution discipline.
