# ADR 0004: Newsroom shell

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

StoryRail needs its first product-shaped interface before persistence, application commands, source
intake, or agent execution are connected. The product vision calls for a story-centered desk and a
focused workspace, while ADR 0003 makes Story state an explicit domain contract. A presentation
prototype can test that shape without implying that deferred editorial capabilities already work.

## Decision

StoryRail uses a responsive two-panel newsroom shell. The narrower desk panel presents StoryRail's
identity, all eight Story-state queues, and the Stories in the selected queue. The wider workspace
panel presents the selected Story's editorial context and can switch to a clearly disconnected
Assistant view.

Queue navigation is a projection of the domain's `STORY_STATES` and each fixture Story's `state`.
Human-readable queue labels use an exhaustive, type-checked `StoryState` mapping. Counts are derived
from the fixture collection rather than stored independently, and the presentation does not copy or
interpret the transition matrix.

The static records contain valid domain `Story` objects augmented with presentation-only metadata:
a summary, source count, assigned-role label, and last-activity description. This projection metadata
does not introduce Source, Assignment, Article, or AgentRun domain entities and does not alter the
Story contract.

Client-local state is limited to the selected queue, selected Story identity, and Story/Assistant view
mode. It is transient interface state, not editorial authority or persistence. Static typed fixtures
are used because this batch is intended to establish layout, hierarchy, interaction, and accessibility
before database and application-service boundaries are selected.

Drag-and-drop is deferred until a drop can invoke an authorized domain or application command and
produce the required durable result. Likewise, unfinished actions are not rendered as enabled controls:
the shell has no intake form, state-transition controls, composer, fake model output, or simulated
publication behavior. Placeholder sections explain what is deferred without pretending it is connected.

The desktop layout keeps the queue desk narrower than the Story workspace. Tablet and mobile layouts
adapt into a readable single-column flow without hiding queue or state information or introducing
horizontal scrolling. Queue, Story, and workspace selections use labeled buttons with exposed selected
state, meaningful landmarks and headings, visible keyboard focus, and touch-friendly targets.

Persistence, database code, APIs, server actions, editorial transitions, agent execution, source intake,
durable assignments and activity, article creation and editing, and publication remain deferred.

## Consequences

The application now communicates StoryRail's intended editorial desk shape and exercises selection
behavior against the existing domain types. Future application layers can replace the fixtures while
retaining the projection boundary, provided editorial state continues to come from authoritative Story
data and commands remain responsible for actual transitions.

The fixture data is illustrative rather than durable. Reloading resets selection, and none of the
visible metadata proves that a Source, Assignment, receipt, or agent run exists. Those limitations are
made explicit in the interface.

## Alternatives considered

- **Build persistence and APIs with the first shell:** Deferred because their boundaries require
  separate decisions and are unnecessary to validate the initial product hierarchy.
- **Drive queue movement with local drag-and-drop:** Rejected because visual movement without an
  authorized command and durable transition would misrepresent editorial state.
- **Present disabled or simulated workflow actions:** Rejected because nonfunctional controls and fake
  outputs would obscure the product's current capabilities.
- **Use a generic dashboard or marketing page:** Rejected because the product vision calls for a compact,
  story-centered editorial desk and coordinated workspace.
