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

The slice preserves source provenance, keeps the source, story, and article separate, records assignment and agent-run inputs and outputs, links material claims to supporting sources, preserves article revisions, enforces explicit editorial states, and requires an operator-controlled decision before export. URL intake retains the exact submission, uses a conservative canonical URL to surface an existing Source identity for exact duplicates, and does not infer that different URLs belong to the same Story. Firecrawl v2 direct REST is the first replaceable HTTP extraction adapter. Extraction still produces immutable success or failure facts through the existing provider-neutral domain boundary, and each retry preserves rather than overwrites the earlier outcome. Executable orchestration and persistence remain future work.

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
