# ADR 0020: Durable Autopilot policy runs

- Date: 2026-08-23
- Status: Accepted

## Context

Autopilot is an operator-authorised policy that invokes the existing editorial workflows in order. It first sequenced those steps in memory. Every individual step was durable, but nothing recorded that a Story or Source was under automation at all, so a process that died between two steps left no trace of an automation to resume or abandon. Starting from a URL widened the gap: the page is preserved, extracted, and prepared before any Story exists, and those are the slowest and most interruptible minutes of a run.

## Decision

Record each Autopilot run as a durable `policy_runs` row (migration `0061-durable-policy-runs.sql`). The row is a coordination record, not a second copy of editorial history: transition receipts and AgentRuns already hold what happened. It carries the policy, the requesting operator, a moving `step` pointer, an `attempt` number, and a `running` or `settled` status. A settled run has a conclusion of `completed`, `stopped`, or `abandoned` with a reason and completion time. Autopilot is a policy, not an actor, so the operator who authorised the run remains the actor on every record it causes to be written.

Progress is recorded before each step rather than after it, so a run that dies inside a step is found at the step it was attempting. PostgreSQL enforces the lifecycle. A partial unique index allows at most one running policy per Story, and later per Source. A trigger lets progress move but refuses any change to a settled run or to a run's identity, requester, or start time.

A run started from a URL has no Story until the step that creates one (`0072-policy-runs-from-a-url.sql`). It is instead rooted at the Source it has already preserved (`0074-policy-run-source-roots.sql`) and swaps that root to the Story exactly once, immediately after Story creation, provided both belong to the same Site. The step vocabulary names every stage from `source_intake` through `delivery`, and `GET /api/sites/{siteId}/policy-runs/{policyRunId}` lets a watcher follow a run that has no Story yet.

Writer steps may retry a retryable failure a bounded number of times. The attempt number is durable, limited to three, and only Writer draft and revision steps may exceed the first (`0075-policy-run-attempts.sql`).

## Consequences

An interrupted automation is visible, attributable, and can be closed accurately, which ADR 0022 uses. Two runs cannot drive the same Story or Source at once. Tenancy is preserved even for work that has no Story.

The sequence itself still continues in the process that received the request after the response is sent. A dead process is detected and closed, not resumed, and an operator starts a new run.

## Rejected or deferred

- An append-only step history, which would duplicate transition receipts and AgentRuns.
- Requiring a Story identity when a URL run begins.
- Resuming an interrupted run automatically.
- Policies other than `autopilot`, and a durable job queue.
