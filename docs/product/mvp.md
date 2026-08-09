# MVP: MCU editorial vertical slice

The first vertical slice uses Marvel Cinematic Universe (MCU) coverage to exercise one complete, operator-supervised editorial path. It proves the workflow, not a broad publishing platform.

## Workflow

1. Paste a URL.
2. Preserve and extract the source.
3. Create a story.
4. Produce an assignment brief.
5. Run one general MCU writer.
6. Produce research notes and a claim/source ledger.
7. Generate an article draft.
8. Run an independent editor-in-chief review.
9. Approve, reject, or request changes.
10. Permit no more than two revision cycles.
11. Publish an approved Story through a separate, explicit operator transition, exporting its Article as Markdown and structured JSON.

## In scope

The slice preserves source provenance, keeps the source, story, and article separate, records assignment and agent-run inputs and outputs, links material claims to supporting sources, preserves article revisions, enforces explicit editorial states, and requires an operator-controlled decision before export. URL intake retains the exact submission, uses a conservative canonical URL to surface an existing Source identity for exact duplicates, and does not infer that different URLs belong to the same Story. Firecrawl v2 direct REST is the first replaceable HTTP extraction adapter. Extraction still produces immutable success or failure facts through the existing provider-neutral domain boundary, and each retry preserves rather than overwrites the earlier outcome. StoryRail defines provider-neutral application workflows that validate and preserve a submitted URL Source, load an authoritative preserved Source, coordinate one extraction attempt, and durably append either its successful or expected-failure outcome through the persistence ports. A concrete PostgreSQL adapter provides durable Source and extraction persistence behind those ports, with database-enforced uniqueness, restrictive Source references, and stable append ordering.

StoryRail now also has one combined application workflow that preserves a submitted URL and records one extraction attempt. It reports explicit preservation-versus-extraction failure stages, retains the preserved Source when extraction cannot complete, and returns both the exact Source and durable extraction fact when the sequence completes. Expected provider failures remain completed extraction facts rather than orchestration failures. Duplicate Sources are surfaced as preservation failures rather than automatically re-extracted.

The server-only Source-evidence runtime exposes the combined workflow alongside both primitive workflows. Guarded environment configuration supplies PostgreSQL and Firecrawl values, the runtime creates and owns one PostgreSQL Pool with explicit idempotent closure, and concrete UUID identities and an ISO timestamp clock are supplied to the existing PostgreSQL, Firecrawl, and Source-evidence workflows. Runtime construction does not execute migrations, connect or query PostgreSQL, or perform provider work.

StoryRail now has one Node.js Route Handler at `POST /api/source-evidence/url`. It accepts an exact JSON request containing only `submittedUrl`, derives fixed single-operator provenance from `STORYRAIL_OPERATOR_ID`, and lazily reuses one Source-evidence runtime within each provider instance. Stable status mapping distinguishes transport, URL-validation, preservation-conflict, extraction-stage, and unexpected failures. A completed response contains both the preserved Source and durable extraction fact; a durable expected provider failure is also completed and returns `201`. If extraction orchestration fails after preservation, the `500` response retains the preserved Source as durable partial progress.

The newsroom now has a connected, separate Source-intake workspace. It submits the exact operator-entered URL to the existing route and presents complete Source and extraction receipts. Durable expected provider failures remain visibly completed operations. Preservation validation, preservation conflicts, extraction-stage partial completion, interface failures, and unavailable responses have explicit states; partial completion retains the preserved Source. Unknown or unavailable responses expose only a safe message. The transient input, pending operation, and latest receipt survive workspace switching within the current page session, but a reload cannot reconstruct the latest receipt.

Durable Story creation is now implemented behind a provider-neutral application boundary. A caller supplies only a title; the domain trims its surrounding whitespace, requires a non-empty result, and constructs the fixed initial `intake` Story with revision cycle `0`, one application-generated identity, and one application clock value shared by both timestamps. PostgreSQL preserves the authoritative complete Story immutably, treats an exact same-ID replay as idempotent, and reports a different same-ID Story as a conflict. This capability is not connected to runtime, HTTP, UI, queues, fixtures, Source intake, or Source attachment.

Fixed operator provenance is not authentication, and the route still must not be exposed publicly. Fixture-backed Stories remain unchanged: Source intake does not create a Story, and Source attachment remains deferred. Durable Story creation has no public transport or runtime composition. No Source listing, lookup, or later inspection interface exists. Migrations remain external. Authentication remains deferred. Graceful shutdown and development hot-reload lifecycle policy remain deferred. StoryRail is therefore not yet an end-to-end operational editorial workflow, deployed system, or production-ready product.

## Acceptance criteria

- An operator can enter a URL and inspect the preserved Source and each attributable extraction outcome, including failed attempts and later retries.
- The operator can create a distinct story and attach the source to it.
- The system can produce a structured assignment for the single MCU writer role.
- Research notes distinguish sourced facts, unresolved claims, and original synthesis.
- A claim/source ledger connects material draft claims to evidence or flags them as unsupported.
- Drafts and subsequent revisions remain separately inspectable.
- An independent editor-in-chief review records its evidence, outcome, and requested changes.
- The workflow allows approval, rejection, or a change request and blocks a third revision cycle.
- Only an approved Story can be explicitly transitioned to published by an operator, with its approved article exported as Markdown and structured JSON.
- Agent activity and editorial decisions leave durable receipts.

## Deferred

- RSS automation
- automatic clustering
- semantic duplicate detection across Sources or Stories
- multiple writer profiles
- direct publishing integrations
- image generation
- full rich-text editing
- authentication and teams
- plugin marketplace
- arbitrary workflow builder
- analytics
- social publishing
