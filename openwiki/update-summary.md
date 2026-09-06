---
type: Reference
title: OpenWiki Update Summary
description: Summary of changes made to the StoryRail OpenWiki documentation during this update cycle.
---
The StoryRail OpenWiki documentation is now current with the repository state at commit aba939a097febf62559dbbff687cfdfe25a4fd93.

Updated files:
- /openwiki/quickstart.md
- /openwiki/architecture/domain-model.md
- /openwiki/architecture/database-schema.md
- /openwiki/architecture/adapters-and-runtime.md
- /openwiki/architecture/application-workflows.md
- /openwiki/architecture/http-api.md
- /openwiki/architecture/newsroom-ui.md
- /openwiki/architecture/source-map.md
- /openwiki/update-summary.md

The documentation reflects all changes including:
- Supervised editorial browser acceptance tests in Playwright (`e2e/newsroom-smoke.spec.ts`, `e2e/supervised-editorial-journey.spec.ts`, `playwright.config.ts`), mock services server (`e2e/support/external-services.mjs`), and database reset automation (`e2e/support/reset-test-database.mjs`) (`43b3079`, `aba939a`)
- Configurable provider base URL (`STORYRAIL_OPENROUTER_BASE_URL`) with runtime validation in `src/runtime/openrouter-configuration.ts` (`aba939a`)
- Interrupted manual run recovery (`0cff50b`), migration `0079-agent-run-recovery.sql` with database-owned `recorded_at` timestamps and partial indexing (`agent_runs_stale_running_idx`), and stale running AgentRun recovery in `reconcile-abandoned-work.ts`
- Ambiguous delivery outcome tracking (`unknown` outcome), operator delivery reconciliation workflow (`reconcile-story-delivery.ts`), PostgreSQL reconciliation persistence, and migration `0078-ambiguous-delivery-reconciliation.sql` (`18e954c`)
- Legacy delivery mapping resolutions (`00b4167`), migration `0077-legacy-delivery-mapping-resolutions.sql`, snapshot validation, and operator review workflow (`resolve-legacy-delivery-mapping.ts`)
- Preserving literal Markdown text during article quote grounding normalization (`visibleInlineMarkdown`) (`b326185`)
- Prevention of stale story inspection selections in `NewsroomShell` via generational request tracking (`b896886`)
- End-to-end URL-to-delivered post Autopilot sequence with research budget settings and migrations `0072-policy-runs-from-a-url.sql` and `0073-research-budget-settings.sql` (`3f93984`)
- Interactive Story Rail navigation, pinned compact rail on manuscript scroll, and streamlined one-action editorial operations (`be6c968`)
- Real-time tool activity stream and budget metrics in inspection and newsroom workspace (`1ba59c6`)
- Idempotent agent run polling avoiding in-flight collisions (`a605b43`)
- Support for Researcher agent inspections across browser clients (`b8d43ae`)
- SearXNG web search integration and search settings migration `0071-search-settings.sql` (`ac8c985`)