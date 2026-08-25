---
type: Reference
title: OpenWiki Update Summary
description: Summary of changes made to the StoryRail OpenWiki documentation during this update cycle.
---
The StoryRail OpenWiki documentation is now current with the repository state at commit 8d68f9467806db207f2eca04949e84dec9a5e884.

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
- /openwiki/engineering-workflow.md
- /openwiki/update-summary.md

The documentation reflects all changes including:
- Dynamic model catalog discovery filtered by structured-output capabilities (`cb2aca6`)
- Story delivery subsystem to external destinations such as StudioCMS, with pre-execution recording and durable audit logging (`184b153`)
- Database migrations 0067 and 0068 for story deliveries and site destination settings (`184b153`)