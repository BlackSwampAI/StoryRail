---
type: Reference
title: OpenWiki Update Summary
description: Summary of changes made to the StoryRail OpenWiki documentation during this update cycle.
---
The StoryRail OpenWiki documentation is now current with the repository state at commit 13b77c4fcaf06cf0de1089bb7652c701896620f0.

Updated files:
- /openwiki/quickstart.md
- /openwiki/architecture/overview.md
- /openwiki/architecture/domain-model.md
- /openwiki/architecture/database-schema.md
- /openwiki/architecture/adapters-and-runtime.md
- /openwiki/architecture/application-workflows.md
- /openwiki/architecture/http-api.md
- /openwiki/architecture/newsroom-ui.md
- /openwiki/architecture/source-map.md
- /openwiki/update-summary.md

The documentation reflects all changes including:
- Multi-site routing and tenancy (`/s/[siteId]` and `/api/sites/[siteId]/*`) with site creation, site switcher, and migration `0070-site-switching.sql` (`df39e29`)
- WordPress delivery destination alongside StudioCMS, serialized via Gutenberg blocks (`f9c6680`, migration `0069-destination-kind.sql`)
- Operator destination settings and delivery UI with real-time status reporting and re-delivery (`2d03320`, `27ad55f`)
- Newsroom identity propagation across all agent roles at runtime (`13b77c4`)
- Plain reading prose toggle in `ArticleReader` without ungrounding Markdown artifacts (`ca6e4e8`)
- Grounding normalization to ignore Markdown markup when validating quotations against evidence (`b2877c2`)
- Handling `MODEL_CORRECTION_OUT_OF_SCOPE` refusals carrying grounding findings across domain, persistence, and UI (`6f4807d`, `fd26a87`)
- Scoped Newsroom Standards client wiring (`43364d5`)