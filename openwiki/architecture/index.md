# Files

- [Adapters and runtime composition](adapters-and-runtime.md) - PostgreSQL persistence plus Firecrawl and OpenRouter adapters, composed into focused runtimes with injectable external seams.
- [Application workflows](application-workflows.md) - Use-case orchestration layer that composes domain rules with repository ports for Source evidence, Story creation, Source attachment, inspection, listing, inbox, and Source triage.
- [PostgreSQL schema and migrations](database-schema.md) - StoryRail storyrail schema migrations for Sources, raw and prepared evidence, Stories, attachments, and triage decisions, with JSONB payload integrity constraints.
- [Editorial domain model](domain-model.md) - Pure domain types, validation rules, and the Story state machine that form the hexagonal core of StoryRail, with Source intake, extraction, triage, Story creation, Source attachment, Assignment, AgentRun, Director review, and ReviewDecision contracts.
- [HTTP API endpoints](http-api.md) - Next.js route handlers for Source intake, Source extraction retry, Prepared Evidence, Story management, Source inbox, and triage, with request shapes and status code maps.
- [Newsroom UI shell](newsroom-ui.md) - Resizable React newsroom workbench with a Story desk, Source-evidence intake, Source inbox, Agent Profiles, and a Story workspace covering assignment, Writer execution, review submission, Director review, operator decisions, operator Story rejection, and Article reading.
- [StoryRail architecture overview](overview.md) - Layered Next.js application organized as a hexagonal editorial control plane with domain, application, adapter, runtime, HTTP interface, and newsroom UI layers.
- [Repository source map](source-map.md) - Canonical file and directory locations for StoryRail's domain, application, adapters, runtime, HTTP interface, Next.js routes, newsroom UI, database migrations, and engineering configuration.
