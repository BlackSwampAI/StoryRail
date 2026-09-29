# ADR 0022: Reconciliation of abandoned work

- Date: 2026-09-05
- Status: Accepted

## Context

With policy runs (ADR 0020) and running tool calls (ADR 0021) durable, a process that disappears leaves records that claim to be in flight: a running policy run, a running AgentRun that the workspace polls indefinitely, running tool calls, and a running destination delivery (ADR 0024). Manual, non-Autopilot runs can be orphaned in the same way but have no policy run to age out. An AgentRun left running by a dead process is also not a model failure and should not send an operator looking for a provider problem.

## Decision

Reconciliation closes abandoned work and never resumes it. Resuming could repeat a model call that had already completed and charge for it twice, and the record cannot say which happened. Closing states plainly what is known and leaves the next move to a person.

The `createReconcileAbandonedWork` workflow takes a threshold, fifteen minutes by default and deliberately long because model calls and research are slow. It settles stale running policy runs as `abandoned`, fails their still-running AgentRuns with `MODEL_RUN_ABANDONED`, and fails those runs' still-running tool calls with `TOOL_RUN_ABANDONED`. Runs are closed before their policy is settled, so a settled policy never points at work still claiming to be in flight. A run that never reached a Story has no AgentRun to close.

Manual AgentRuns are aged by `recorded_at`, which PostgreSQL assigns when it accepts the intent, not by a caller-supplied model timestamp (`0079-agent-run-recovery.sql`). Existing running rows receive the migration instant, so they get a full recovery window after deployment. A stale manual run is closed only when no running policy owns its Story, and completion remains one-way, so a concurrent normal completion wins and is never overwritten. The pass reports what it closed.

A destination delivery is aged the same way, by a PostgreSQL-assigned `recorded_at` (`0080-story-delivery-recovery.sql`), and settled to `unknown` rather than `failed`, because the request may have reached the destination before the process died and a failure would invite a retry that duplicates a page. `unknown` needs no new shape: a stuck create carries no remote identifier and a stuck update already carries the one it was addressing, which is exactly what the `unknown` constraints of `0078` require. The settled row carries the `DESTINATION_REQUEST_OUTCOME_UNKNOWN` uncertainty and routes into the existing operator reconciliation of ambiguous deliveries, which already gated a further delivery while the row was `running`. Nothing is sent again. Completion is one-way, so a delivery that completes normally first is left alone and is not reported. Each closed delivery appears in the pass's report.

It is exposed as an explicit `POST /api/sites/{siteId}/reconciliation` rather than a timer inside the application, because when reconciliation happens is an operational decision. A deployment can schedule it and a person can invoke it after a crash, from the Recover interrupted work action in Site settings, which calls the same endpoint and shows what it closed.

## Consequences

Dead automation and orphaned runs stop appearing to be live, with an accurate failure code and no repeated external work. Retry stays an operator decision.

Nothing in the repository schedules the endpoint, so a deployment that wants recovery without a person must call it itself. Deliveries the pass settles to `unknown` are resolved through the operator-driven reconciliation of ambiguous deliveries (ADR 0024). A delivery whose process was only slow, not dead, and completes after the threshold finds its row already settled and is reported as not recorded; the operator reconciles it like any other unknown outcome.

## Rejected or deferred

- Automatically resuming or replaying interrupted work.
- An in-process timer or background job.
- Deriving age from model-supplied timestamps.
- Closing runs still owned by a live policy.
- Settling a stuck delivery to `failed`, which would permit a duplicating retry.
- Resumption of interrupted policy runs and automatic scheduling, which remain deferred.
