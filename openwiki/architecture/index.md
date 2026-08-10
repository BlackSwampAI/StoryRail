# Files

- [Adapters and runtime composition](adapters-and-runtime.md) - PostgreSQL persistence plus Firecrawl and OpenRouter adapters, composed into focused runtimes with injectable external seams.
- [Application workflows](application-workflows.md) - Use-case orchestration for raw and prepared Source evidence, Story creation, attachment, inspection, listing, inbox, and triage.
- [PostgreSQL schema and migrations](database-schema.md) - StoryRail migrations for Sources, raw and prepared evidence, Stories, attachments, and triage decisions.
- [Editorial domain model](domain-model.md) - Pure domain types, validation rules, and the Story state machine that form the hexagonal core of StoryRail, with Source intake, extraction, triage, Story creation, and Source attachment contracts.
- [HTTP API endpoints](http-api.md) - Next.js route handlers for Source intake, Prepared Evidence, Story management, Source inbox, and triage.
- [Newsroom UI shell](newsroom-ui.md) - React newsroom shell with Story desk, Source intake, raw and prepared evidence, Source inbox, triage, and Story inspection.
- [StoryRail architecture overview](overview.md) - Layered Next.js application organized as a hexagonal editorial control plane with domain, application, adapter, runtime, HTTP interface, and newsroom UI layers.
- [Repository source map](source-map.md) - Canonical file and directory locations for StoryRail's domain, application, adapters, runtime, HTTP interface, Next.js routes, newsroom UI, database migrations, and engineering configuration.
