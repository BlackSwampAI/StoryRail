# MVP: MCU editorial vertical slice

The first vertical slice uses Marvel Cinematic Universe (MCU) coverage to exercise one complete, operator-supervised editorial path. It proves the workflow, not a broad publishing platform.

## Target workflow

The first five steps are implemented today. The remaining writing, review, Article, and publishing steps describe the planned completion of this vertical slice.

Durable Agent Profiles configure the future Assignment Editor, Writer, and Director roles. PostgreSQL seeds three immutable built-in profiles, and operators may create additional immutable Writer profiles with an optional provider-neutral model descriptor. Operators may select a Writer Profile for a durable manual Assignment, but profiles remain configuration only and no agent or model executes.

1. Paste a URL.
2. Preserve and extract the source.
3. Review the immutable raw extraction in Source Inbox and optionally prepare cleaner evidence.
4. Create a new Story, attach the Source to an existing Story, or durably skip coverage.
5. Produce an assignment brief.
6. Run one general MCU writer.
7. Produce research notes and a claim/source ledger.
8. Generate an article draft.
9. Run an independent editor-in-chief review.
10. Approve, reject, or request changes.
11. Permit no more than two revision cycles.
12. Publish an approved Story through a separate, explicit operator transition, exporting its Article as Markdown and structured JSON.

## In scope

The slice preserves source provenance, keeps the source, story, and article separate, records assignment and agent-run inputs and outputs, links material claims to supporting sources, preserves article revisions, enforces explicit editorial states, and requires an operator-controlled decision before export. URL intake retains the exact submission, uses a conservative canonical URL to surface an existing Source identity for exact duplicates, and does not infer that different URLs belong to the same Story. Firecrawl v2 direct REST is the first replaceable HTTP extraction adapter. Extraction still produces immutable success or failure facts through the existing provider-neutral domain boundary, and each retry preserves rather than overwrites the earlier outcome. StoryRail defines provider-neutral application workflows that validate and preserve a submitted URL Source, load an authoritative preserved Source, coordinate one extraction attempt, and durably append either its successful or expected-failure outcome through the persistence ports. A concrete PostgreSQL adapter provides durable Source and extraction persistence behind those ports, with database-enforced uniqueness, restrictive Source references, and stable append ordering.

StoryRail now also has one combined application workflow that preserves a submitted URL and records one extraction attempt. It reports explicit preservation-versus-extraction failure stages, retains the preserved Source when extraction cannot complete, and returns both the exact Source and durable extraction fact when the sequence completes. Expected provider failures remain completed extraction facts rather than orchestration failures. Duplicate Sources are surfaced as preservation failures rather than automatically re-extracted.

The server-only Source-evidence runtime exposes the combined workflow alongside both primitive workflows. Guarded environment configuration supplies PostgreSQL and Firecrawl values, the runtime creates and owns one PostgreSQL Pool with explicit idempotent closure, and concrete UUID identities and an ISO timestamp clock are supplied to the existing PostgreSQL, Firecrawl, and Source-evidence workflows. Runtime construction does not execute migrations, connect or query PostgreSQL, or perform provider work.

StoryRail now has one Node.js Route Handler at `POST /api/source-evidence/url`. It accepts an exact JSON request containing only `submittedUrl`, derives fixed single-operator provenance from `STORYRAIL_OPERATOR_ID`, and lazily reuses one Source-evidence runtime within each provider instance. Stable status mapping distinguishes transport, URL-validation, preservation-conflict, extraction-stage, and unexpected failures. A completed response contains both the preserved Source and durable extraction fact; a durable expected provider failure is also completed and returns `201`. If extraction orchestration fails after preservation, the `500` response retains the preserved Source as durable partial progress.

The newsroom now separates Source intake from Source Inbox. Intake submits the exact operator-entered URL, preserves complete Source and extraction receipts, and never creates a Story. Source Inbox reads pending evidence from PostgreSQL without calling Firecrawl and lets the operator make one durable final decision: create a new Story and attach the Source, attach it to an existing Story, or skip coverage without deleting evidence. Every decision requires a trimmed editorial reason and records server-derived operator provenance; the provider-neutral model also supports the future `assignment_editor` agent. Attached historical Sources are treated as resolved even when they predate triage decisions. Story queues begin only after a Story actually exists.

The manual triage workflows keep Story creation, Source attachment, and final triage persistence as explicit operations. Semantic replay of the same final decision returns the authoritative original decision and timestamp, while divergent replay conflicts. Partial progress is reported without destructive rollback or accidental automatic replay.

Firecrawl retains the existing deterministic raw-extraction settings and now uses its automatic proxy strategy so the provider may escalate retrieval for sites with stronger anti-bot behavior. Raw extraction remains authoritative and immutable: no extraction row, raw Markdown, or Source metadata is rewritten. An operator may explicitly prepare any successful raw extraction. That separate operation passes untrusted raw metadata and Markdown to a versioned StoryRail evidence-cleaning prompt, stores every successful or failed preparation attempt as a new immutable derived record, and never resolves Source triage or runs automatically during intake.

The first provider-neutral structured-model boundary is backed by LangChain's dedicated `ChatOpenRouter` adapter and strict structured output, with StoryRail performing final Zod validation. OpenRouter is the first implemented provider and `STORYRAIL_EVIDENCE_PREPARATION_MODEL` leaves model selection to the operator environment. Evidence preparation has its own server-only runtime requiring PostgreSQL, `OPENROUTER_API_KEY`, and the selected model, while ordinary Story, Inbox, triage, and raw-intake paths do not require OpenRouter configuration. Assignment Editor automation remains deferred.

The newsroom's eight Story queues are backed by persisted Stories rather than illustrative fixtures. One durable listing supplies real queue counts and real title/source-count cards, including truthful zero counts. Story cards survive browser reload because the listing is reconstructed from PostgreSQL, and selecting a card loads the authoritative Story inspection with its attached Sources, Assignment, Writer Profile, and append-ordered transition activity. A newly created Story enters Intake; a successful manual Assignment immediately moves it to Assigned and remains there after reload.

Manual Assignment is a bounded provider-neutral workflow. It loads the authoritative Intake Story and selected Writer Profile, derives a deterministic snapshot of all attached Source identities, constructs the immutable Assignment, and uses the existing Story state machine for `intake` to `assigned`. One PostgreSQL transaction locks and rechecks the Story, Writer role, evidence snapshot, and one-Assignment invariant before inserting the Assignment, updating the Story, and appending the transition receipt. Concurrent requests cannot both win, and no provider or model is contacted.

Durable Story creation is now implemented behind a provider-neutral application boundary. A caller supplies only a title; the domain trims its surrounding whitespace, requires a non-empty result, and constructs the fixed initial `intake` Story with revision cycle `0`, one application-generated identity, and one application clock value shared by both timestamps. PostgreSQL preserves the authoritative complete Story immutably, treats an exact same-ID replay as idempotent, and reports a different same-ID Story as a conflict.

Durable Source-to-Story attachment is now implemented as a separate provider-neutral operation over existing Story and Source identities. A caller supplies required relevance and attributable operator or bounded-agent provenance; the application supplies one attachment time. PostgreSQL preserves the complete composite-keyed relationship immutably, treats an exact replay as success, rejects any different same-pair relationship facts as a conflict, and reports missing parents with Story-first precedence. Attachment does not create or transition a Story or preserve or extract a Source.

A provider-neutral durable Story inspection read model now returns one authoritative Story together with each explicitly attached authoritative URL Source, the immutable attachment facts connecting them, every durable Source extraction attempt, and every prepared-evidence attempt in append order. Existing Stories without attachments return an empty Source collection, and attached Sources may have empty raw or prepared histories. PostgreSQL performs the Story-centered read in one query without multiplying joined histories. The Story workspace prioritizes prepared evidence while keeping raw extraction and technical records inspectable. Reopening a Story after a browser reload reconstructs both layers from PostgreSQL. More aggressive scraper fallback and manual evidence entry remain deferred.

A separate server-only Story runtime composes creation, Source attachment, listing, inspection, pending Source listing, final Source triage persistence, Agent Profiles, and atomic manual Assignment over one owned PostgreSQL Pool without requiring Firecrawl or OpenRouter. Lazy Node.js Route Handlers expose those bounded operations, including `POST /api/stories/{storyId}/assignments`. They provide exact JSON transport validation, stable expected-error status mapping, safe unexpected-failure responses, and operator provenance from `STORYRAIL_OPERATOR_ID`.

Fixed operator provenance is not authentication, and the routes still must not be exposed publicly. Source intake never creates a Story or invokes a model automatically; manual preparation and triage are required. Story listing has no searching, filtering, pagination, polling, or browser persistence. Migrations remain external. Assignment Editor automation, Writer and Director model behavior, profile editing/version management, later Story transitions, reassignment, authentication, graceful shutdown, and development hot-reload lifecycle policy remain deferred. StoryRail is therefore not yet an end-to-end operational editorial workflow, deployed system, or production-ready product.

## Full-slice acceptance criteria

These criteria describe the complete target slice and are only partially implemented; see the repository README for the current feature boundary.

- An operator can enter a URL and inspect the preserved Source and each attributable extraction outcome, including failed attempts and later retries.
- The operator can review a pending Source and durably choose new Story, existing Story, or skip.
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
- profile editing and version management
- direct publishing integrations
- image generation
- full rich-text editing
- authentication and teams
- plugin marketplace
- arbitrary workflow builder
- analytics
- social publishing
