# Terminology

These terms form StoryRail's shared editorial language.

- **Source:** Preserved input or evidence, including its origin, retrieval details, and extracted material.
- **Story:** The central editorial object representing a candidate or active piece of coverage across its lifecycle.
- **Story state:** One explicit point in a Story's editorial lifecycle: `intake`, `assigned`, `in_progress`, `in_review`, `changes_requested`, `approved`, `rejected`, or `published`.
- **Transition receipt:** The durable audit record produced by a successful Story state change, including the transition and Story identities, previous and next states, actor, reason, occurrence timestamp, and resulting revision-cycle count.
- **Actor:** The operator or bounded agent role responsible for requesting a Story state transition; durable receipts identify a specific operator or tie an agent actor to a specific agent run.
- **Revision cycle:** One bounded return from `in_review` to `changes_requested`; a Story may enter no more than two revision cycles.
- **Story source:** The durable relationship between a story and a source, including relevance and provenance.
- **Assignment:** A bounded brief describing the angle, audience, requirements, constraints, and expected deliverable for a story.
- **Article:** A versioned editorial work product created for a story; it is not the story itself.
- **Article revision:** An immutable or durably preserved version of an article produced by drafting or revision.
- **Agent run:** One recorded execution of a bounded role, including inputs, configuration, outputs, timing, and outcome.
- **Editorial review:** A recorded evaluation that may approve, reject, or request changes to editorial work.
- **Publication:** A separate, explicit act that sends an approved article to an export or publication destination.
- **Desk/queue:** An operator-facing view of stories awaiting attention, action, or resolution.
- **Assignment editor:** The role that assesses a story and prepares or refines its assignment.
- **Writer:** The role that researches and drafts within an assignment's scope.
- **Fact checker:** The role that evaluates material claims against cited evidence and records findings.
- **Editor-in-chief:** The independent review role responsible for an overall editorial decision.
- **SEO packaging:** Preparation of accurate discovery metadata and presentation options without making rankings the sole editorial purpose.
- **Source extractor:** A replaceable adapter that retrieves and normalizes source material while retaining provenance.
- **Publication adapter:** A replaceable integration that exports or publishes approved article data to a destination.

## Invariants

- A source is not a story.
- A story is not an article.
- Multiple sources may belong to one story.
- A story may be rejected or merged without producing an article.
- Article revisions are preserved rather than silently overwritten.
- Agent decisions require durable receipts.
- Publication is a separate, explicit action.
