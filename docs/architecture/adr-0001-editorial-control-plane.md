# ADR 0001: StoryRail as an editorial control plane

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

StoryRail needs a stable product and architecture boundary before selecting application frameworks. Editorial work moves from raw evidence through assessment, assignment, research, drafting, review, revision, approval, and publication. Collapsing those stages into a feed item, generated document, or opaque agent conversation would weaken provenance, recovery, and human control.

## Decision

- StoryRail is an editorial control plane, not a page-building CMS.
- `Story` is the central editorial object. Sources, stories, and articles remain separate.
- Editorial movement is controlled by an explicit, durable state machine.
- Agent roles are bounded prompt, tool, and model configurations, not unconstrained personalities.
- Agent outputs use structured schemas suitable for validation, review, and storage.
- Revision loops are bounded.
- Editorial decisions and model activity require durable audit receipts.
- Source extraction and publication use replaceable adapters.
- Plain HTTP extraction is the default. Obscura may later be implemented as an optional fallback for JavaScript-rendered sources.
- OpenWiki is optional project-documentation tooling and is not a StoryRail runtime dependency.
- Exact application frameworks and infrastructure versions will be selected in later ADRs.

## Consequences

The system must preserve object identity, relationships, revisions, transitions, and provenance instead of treating generated prose as the primary record. Human operators can inspect and resolve exceptions, while automation remains replaceable and constrained. This creates additional schema and workflow work, but enables reproducibility, auditing, and deliberate publication. The core remains independent of any specific model, extractor, publishing platform, or documentation generator.

## Alternatives considered

- **Traditional CMS with agent features:** Rejected because page construction would define the product boundary and obscure the cross-channel editorial workflow.
- **Feed item as the central object:** Rejected because an incoming item is evidence, not an editorial decision, and multiple sources may support one story.
- **Article as the central object:** Rejected because stories can be assessed, merged, rejected, or researched before an article exists.
- **Free-form multi-agent conversation:** Rejected because unconstrained roles and outputs are difficult to validate, audit, and recover.
- **Obscura as mandatory extraction infrastructure:** Rejected because most sources should begin with simpler plain HTTP extraction and optional fallbacks must remain replaceable.

## Follow-up decisions

Later ADRs should define the editorial state machine, structured schemas and audit receipts, persistence model, framework and infrastructure selections, adapter contracts, security boundaries, and deployment topology.
