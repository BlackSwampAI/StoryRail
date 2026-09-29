# ADR 0021: Tool calls recorded before external calls

- Date: 2026-08-23
- Status: Accepted

## Context

Agents can reach outside the evidence they were handed: the Researcher fetches a URL, searches the web, and searches the newsroom's own archive. A tool call is an audit fact, and reaching outside the system is the act that must not be able to happen unrecorded. The first record (`0058-agent-tool-calls.sql`) was written after the external call returned. A process that died mid-retrieval had already retrieved something and left no trace, and a failure to write the record was ignored while the result was still handed to the model.

## Decision

Give a tool call the same `running` to `succeeded` or `failed` semantics that AgentRuns have (`0062-tool-call-durability.sql`). The intent is appended before anything external happens. The outcome is written afterwards, and PostgreSQL allows a tool call to complete exactly once, never reopen, and never change what it asked for. The `runToolAssisted` loop stops the exchange if either write fails, so a model never acts on material with no durable account of where it came from.

The record is bounded and is not a content store. Request and result are limited in size, and what a tool retrieves becomes evidence with its own immutable record. The tool name is an open string rather than a closed list, because which tools exist is an operator decision. Failure codes include `TOOL_BUDGET_EXHAUSTED`, and the budget is enforced in code by counting calls and turns rather than asked of the model. Tool results are untrusted data and are never instructions.

Destination deliveries follow the same pattern (ADR 0024).

## Consequences

A run that dies part-way still shows what it had reached for, and a call left `running` is identifiable for reconciliation (ADR 0022). Every external reach costs one extra write before it happens, and a failure to write stops the run.

## Rejected or deferred

- Recording only after the call and tolerating a failed write.
- Copying retrieved content into the tool call row.
- A closed database enumeration of tools.
- Retrying a tool call whose outcome is unknown.
