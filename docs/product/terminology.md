# Terminology

These terms form StoryRail's shared editorial language.

- **Source:** Preserved input or evidence with its own identity and attributable provenance. A URL Source retains both the exact submitted URL and its conservative canonical URL; retrieval details and extracted material may be added later without replacing Source identity.
- **Canonical Source URL:** A conservatively normalized URL used for exact Source duplicate comparison. It is distinct from the submitted URL and does not imply content or event equivalence.
- **Duplicate Source:** An intake submission whose canonical Source URL exactly matches an existing Source. Semantic duplicates, mirrors, syndicated material, and separate Sources covering the same event are not included in this definition.
- **Source extraction:** One immutable, attributable attempt to produce normalized evidence from an already-preserved URL Source. Successful and failed outcomes are both retained; each retry is a distinct attempt and does not replace Source identity or an earlier extraction.
- **Extracted document:** The current normalized extraction output: required Markdown content plus nullable title, byline, published timestamp, and language. Markdown preserves useful editorial structure and source links but remains untrusted evidence, never instructions.
- **Story:** The central editorial object representing a candidate or active piece of coverage across its lifecycle.
- **Story state:** One explicit point in a Story's editorial lifecycle: `intake`, `assigned`, `in_progress`, `in_review`, `changes_requested`, `approved`, `rejected`, or `published`.
- **Transition receipt:** The durable audit record produced by a successful Story state change, including the transition and Story identities, previous and next states, actor, reason, occurrence timestamp, and resulting revision-cycle count.
- **Actor:** The operator or bounded agent role responsible for an attributable editorial act, including a Story state transition, Source extraction, or Source-to-Story attachment; durable facts identify a specific operator or tie an agent actor to a specific agent run.
- **Revision cycle:** One bounded return from `in_review` to `changes_requested`; a Story may enter no more than two revision cycles.
- **Story source:** The immutable, durable relationship between an existing Story and an existing Source, identified by that pair and recording required relevance, attributable actor provenance, and one attachment time.
- **Assignment:** One immutable, durable brief for a Story in the current Alpha workflow. It selects an immutable Writer Profile, snapshots all attached Source identities in deterministic order, records a required angle and brief, optional constraints, the assigning actor, and one application-owned assignment time. In the current supervised Assignment Editor flow that actor remains the operator. Creating it atomically persists the Assignment, the Story's `intake` to `assigned` transition, and its transition receipt; it does not execute the Writer.
- **Article:** A durable, versioned editorial work product created for one Story and its immutable Assignment; it is not the Story itself. The current Alpha allows one Article per Story.
- **Article revision:** An immutable preserved version of an Article. Supervised Writer execution creates Revision 1 and may append Revision 2 or 3 after an operator requests changes; every revision preserves Writer Profile and AgentRun provenance.
- **AgentRun:** One immutable, append-ordered execution record for a bounded operation. It records the Story, exact evidence and immutable Profile references used, model and prompt descriptors, requester, timing, and either a structured success or safe failure outcome; it does not become editorial state by itself.
- **Assignment Proposal:** A strict, provider-neutral Assignment Editor suggestion containing a Writer Profile identity, angle, brief, optional constraints, and editorial reason. It is not an Assignment: it has no Assignment identity, assignment actor or time, evidence snapshot ownership, or Story transition. In supervised mode the operator may edit it before using the existing manual Assignment workflow.
- **Agent Profile:** An immutable configuration snapshot for one bounded first-class editorial persona: its role, name, instructions, optional provider-neutral model selection, and built-in/custom status. A profile contains no credentials and does not imply that an agent has executed.
- **Director review:** A strict advisory evaluation of one exact Article revision against its Assignment and the exact evidence references recorded by its Writer AgentRun. It records a recommendation, summary, five checks, and optional revision instructions without mutating editorial state.
- **ReviewDecision:** One durable operator-owned approval or request-changes decision for an Article revision. It references the exact successful Director AgentRun and is committed atomically with the Story transition and receipt; the operator may override the recommendation.
- **Publication:** A separate, explicit act that sends an approved article to an export or publication destination.
- **Desk/queue:** An operator-facing view of stories awaiting attention, action, or resolution.
- **Assignment editor:** The role that assesses a story and prepares or refines its assignment.
- **Writer:** The supervised role that drafts and revises within an Assignment's exact Source snapshot. It uses only supplied evidence, with no browsing, tools, or external research, and each successful run appends an immutable revision before moving the Story to In Progress.
- **Fact checker:** The role that evaluates material claims against cited evidence and records findings.
- **Editor-in-chief:** The independent review role responsible for an overall editorial decision.
- **SEO packaging:** Preparation of accurate discovery metadata and presentation options without making rankings the sole editorial purpose.
- **Source extractor:** A replaceable adapter that retrieves and normalizes source material while retaining provenance.
- **Publication adapter:** A replaceable integration that exports or publishes approved article data to a destination.

## Invariants

- A source is not a story.
- A Source extraction does not create, replace, or recanonicalize Source identity.
- A Source extraction does not create a Story or imply that its Source deserves coverage.
- Extraction retries preserve earlier attempts rather than overwriting them.
- Exact Source duplication is not semantic Story duplication.
- A story is not an article.
- Multiple sources may belong to one story.
- A story may be rejected or merged without producing an article.
- Article revisions are preserved rather than silently overwritten.
- Agent decisions require durable receipts.
- A Story has at most one Assignment in the current Alpha workflow.
- Assignment evidence is a server-derived snapshot of Source identities, not copied evidence content or a browser-selected subset.
- Publication is a separate, explicit action.
