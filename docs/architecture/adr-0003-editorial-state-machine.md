# ADR 0003: Editorial state machine

- **Date:** 2026-08-08
- **Status:** Accepted

## Context

ADR 0001 establishes `Story` as StoryRail's central editorial object and requires explicit, durable editorial state, bounded revision loops, audit receipts, and human accountability. The first domain boundary needs to make those constraints deterministic before persistence, application services, agents, or user interfaces are introduced.

A source is preserved evidence, while an article is a versioned editorial work product. Neither identity can represent the editorial decision to pursue, revise, reject, approve, or publish a piece of coverage. The Story therefore owns that lifecycle even when no Article has been created or several Sources support the work.

## Decision

StoryRail implements a framework-independent Story state machine under `src/domain/editorial`. A Story has one of these exact states:

| State               | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `intake`            | The candidate Story awaits an assignment or rejection decision.         |
| `assigned`          | The Story has been assigned but work has not started.                   |
| `in_progress`       | Research, drafting, checking, or revision work is underway.             |
| `in_review`         | The Story's editorial work awaits a review outcome.                     |
| `changes_requested` | Review has requested another bounded revision cycle.                    |
| `approved`          | An operator has approved the Story for an explicit publication action.  |
| `rejected`          | An operator has ended the Story without publication.                    |
| `published`         | An operator has completed the separate explicit publication transition. |

The exact transition matrix is:

| From                | To                                          |
| ------------------- | ------------------------------------------- |
| `intake`            | `assigned`, `rejected`                      |
| `assigned`          | `in_progress`, `rejected`                   |
| `in_progress`       | `in_review`, `rejected`                     |
| `in_review`         | `changes_requested`, `approved`, `rejected` |
| `changes_requested` | `in_progress`, `rejected`                   |
| `approved`          | `published`                                 |
| `rejected`          | none                                        |
| `published`         | none                                        |

`rejected` and `published` are terminal. Publishing remains a distinct transition after approval rather than a side effect of approval.

Every transition requires a non-empty editorial reason. Moving from `in_review` to `changes_requested` increments the Story's revision-cycle count. The first and second changes requests are permitted; a third is rejected without changing the Story or creating a receipt.

Actors form a bounded discriminated union of operator and agent. Each operator actor carries an operator identity, while each agent actor records a bounded role and its agent-run identity. These opaque identifiers are supplied by future application and authentication layers; they do not select an authentication system. Agents may advance preparatory work and request changes, but only an operator may transition a Story into `approved`, `rejected`, or `published`. These attributable gates preserve human accountability for final editorial and publication decisions.

A successful transition returns a new Story without mutating its input and a durable transition receipt. The receipt records its own identity, the Story identity, the derived previous state, the next state, actor, editorial reason, occurrence timestamp, and resulting revision-cycle count. A rejected transition returns a structured, machine-readable failure with a stable code and relevant context; it does not return a receipt.

The state machine is a pure domain module. It does not depend on Next.js, persistence, agents, queues, or model providers. Callers supply deterministic transition facts such as the transition identity and occurrence timestamp. Future application and persistence layers may authorize commands and store Stories and receipts without owning or duplicating the editorial rules.

## Consequences

Editorial movement can be tested and audited independently of infrastructure. Source, Story, Article, agent-run, and transition identities are type-distinct, reducing accidental identity substitution at compile time. Persistence must eventually store the resulting Story and receipt durably and atomically, but that mechanism is outside this decision.

The fixed state graph deliberately favors a small, inspectable workflow over runtime configurability. Changes to editorial policy require an explicit domain and architecture decision rather than an unrecorded prompt, agent-memory, or UI change.

## Alternatives considered

- **Article-owned lifecycle:** Rejected because a Story can be assessed or rejected before an Article exists, and the editorial decision spans more than a single work-product revision.
- **Source-owned lifecycle:** Rejected because Sources are evidence, multiple Sources may support one Story, and ingestion does not constitute an editorial decision.
- **Free-form or configurable states:** Deferred because the initial workflow needs deterministic rules and stable audit semantics more than arbitrary configuration.
- **Unlimited revision loops:** Rejected because bounded automation and visible exceptions are core product constraints.
- **Agent approval or automatic publication:** Rejected because approval, rejection, and publication carry final human accountability.
- **Approval that publishes implicitly:** Rejected because publication must remain a separate, deliberate operator action.
- **Framework, database, or agent-owned transition logic:** Rejected because editorial invariants must be reusable, deterministic, and testable independently of replaceable infrastructure.
