# ADR 0022: Reconciliation of abandoned work

- Date: 2026-09-05
- Status: Accepted

## Context

With policy runs (ADR 0020) and running tool calls (ADR 0021) durable, a process that disappears leaves records that claim to be in flight: a running policy run, a running AgentRun that the workspace polls indefinitely, and running tool calls. Manual, non-Autopilot runs can be orphaned in the same way but have no policy run to age out. An AgentRun left running by a dead process is also not a model failure and should not send an operator looking for a provider problem.

## Decision

Reconciliation closes abandoned work and never resumes it. Resuming could repeat a model call that had already completed and charge for it twice, and the record cannot say which happened. Closing states plainly what is known and leaves the next move to a person.

The `createReconcileAbandonedWork` workflow takes a threshold, fifteen minutes by default and deliberately long because model calls and research are slow. It settles stale running policy runs as `abandoned`, fails their still-running AgentRuns with `MODEL_RUN_ABANDONED`, and fails those runs' still-running tool calls with `TOOL_RUN_ABANDONED`. Runs are closed before their policy is settled, so a settled policy never points at work still claiming to be in flight. A run that never reached a Story has no AgentRun to close.

Manual AgentRuns are aged by `recorded_at`, which PostgreSQL assigns when it accepts the intent, not by a caller-supplied model timestamp (`0079-agent-run-recovery.sql`). Existing running rows receive the migration instant, so they get a full recovery window after deployment. A stale manual run is closed only when no running policy owns its Story, and completion remains one-way, so a concurrent normal completion wins and is never overwritten. The pass reports what it closed.

It is exposed as an explicit `POST /api/sites/{siteId}/reconciliation` rather than a timer inside the application, because when reconciliation happens is an operational decision. A deployment can schedule it and a person can invoke it after a crash.

## Consequences

Dead automation and orphaned runs stop appearing to be live, with an accurate failure code and no repeated external work. Retry stays an operator decision.

Nothing in the repository schedules the endpoint or exposes it in the newsroom. The pass does not cover destination deliveries left running, and unknown delivery outcomes have their own operator-driven reconciliation (ADR 0024).

## Rejected or deferred

- Automatically resuming or replaying interrupted work.
- An in-process timer or background job.
- Deriving age from model-supplied timestamps.
- Closing runs still owned by a live policy.
