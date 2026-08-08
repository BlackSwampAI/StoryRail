# Product vision

## Problem

Solo publishers and small editorial teams must turn scattered source material into original, defensible coverage while coordinating research, drafting, review, revision, and publication. Existing tools often reduce that work to a feed queue, hide model decisions, or focus on page construction rather than editorial control.

## Users and promise

StoryRail is for hands-on publishers, editors, and compact newsrooms that want bounded automation without surrendering judgment. It promises a visible path from preserved evidence to a reviewed, publishable story, with provenance and editorial decisions retained along the way.

## Operator-supervised newsroom

StoryRail follows an agentic newsroom model. Bounded agents can gather evidence, prepare assignments, draft, check claims, and review work. The human operator manages exceptions, priorities, and editorial judgment instead of manually writing every article. Automation proposes and executes within explicit limits; the operator remains accountable for approval and publication.

## Product shape

The envisioned interface uses two coordinated panels:

- a desk or queue for stories, assignments, status, exceptions, and approvals; and
- a focused workspace for sources, research, claim provenance, article revisions, and agent-run receipts.

The design is story-centered, not feed-item-centered. A URL or RSS item is only a potential source: it does not automatically deserve coverage. Multiple sources may support one story, and editorial review may reject or merge a story before an article exists.

StoryRail is intended to be self-hosted, open source, and model-independent. Publishing will be headless and API-oriented, using replaceable adapters rather than an embedded page builder.

## Principles

- Preserve evidence and provenance.
- Favor original synthesis over source rewriting.
- Make editorial state and automated decisions visible.
- Bound revisions, tools, permissions, and agent roles.
- Keep human approval and publication explicit.
- Allow models and integrations to be replaced.
- Design for a small newsroom before optimizing for scale.

## Non-goals

StoryRail is not a traditional page-building CMS, an autonomous publishing bot, an undifferentiated content generator, or a system whose sole objective is search ranking. It will not assume every incoming item should become an article, use agent memory as authoritative storage, or conceal editorial responsibility behind automation.
