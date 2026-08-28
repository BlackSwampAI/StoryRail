---
type: Reference
title: OpenWiki Update Summary
description: Summary of changes made to the StoryRail OpenWiki documentation during this update cycle.
---
The StoryRail OpenWiki documentation is now current with the repository state at commit a71865c197626fbd5fd23d4ee001435e44643039.

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
- Shared strict Zod schemas across domain, persistence decoders, and browser clients, ending drift between PostgreSQL and UI readers (`e0c46f8`, `a71865c`)
- Bounded Writer retries (up to 3 attempts with fresh run identities) and migration `0075-policy-run-attempts.sql` (`18d219b`)
- Pre-Story reconcilable policy runs with Source rooting and migration `0074-policy-run-source-roots.sql` (`9936048`)
- End-to-end URL-to-delivered post Autopilot sequence with research budget settings and migrations `0072-policy-runs-from-a-url.sql` and `0073-research-budget-settings.sql` (`3f93984`)
- Interactive Story Rail navigation, pinned compact rail on manuscript scroll, and streamlined one-action editorial operations (`be6c968`)
- Real-time tool activity stream and budget metrics in inspection and newsroom workspace (`1ba59c6`)
- Idempotent agent run polling avoiding in-flight collisions (`a605b43`)
- Support for Researcher agent inspections across browser clients (`b8d43ae`)
- SearXNG web search integration and search settings migration `0071-search-settings.sql` (`ac8c985`)