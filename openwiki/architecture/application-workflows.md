---
type: Reference
title: Application workflows
description: Use-case orchestration layer that composes domain rules with repository ports for Source evidence, Story creation, Source attachment, inspection, listing, inbox, and Source triage.
tags: [application, workflows, use-cases, ports]
---

# Application workflows

The application layer (`src/application`) contains the use-case workflows that orchestrate domain rules with repository ports. Each workflow is a factory function (`create*`) that accepts dependencies and returns the workflow function. Dependencies include repository ports, id factories, and a `now` clock, making workflows injectable and testable without a real database or network.

`src/application/index.ts` also exposes the structured-model boundary, Source evidence-preparation, Agent Profile, Assignment, Assignment Proposal, AgentRun, Writer draft, Writer revision, review submission, Director review, review decision, and Story rejection workflows alongside the Source, triage, and Story modules described below.

## Source-evidence workflows

`src/application/source-evidence/` orchestrates Source preservation and extraction:

1. **`preserveUrlSource`** (`preserve-url-source.ts`) — generates a `SourceId` and `receivedAt`, calls the domain `intakeUrlSource` (canonicalization + duplicate check), and persists via `UrlSourceRepository.persist`. Returns `PreserveUrlSourceResult`.
2. **`extractPersistedSource`** (`extract-persisted-source.ts`) — loads a persisted `UrlSource` by id (`SOURCE_NOT_FOUND` if absent), runs extraction, and appends the result via `SourceExtractionRepository.append`. A recorded failure is a durable attempt: it appends to the immutable history exactly like a success. This workflow is also exposed directly as the Source extraction retry endpoint `POST /api/sources/[sourceId]/extractions` (see the [HTTP API](http-api.md)), so an operator can append a new extraction attempt to an already-preserved Source without re-submitting the URL.
3. **`preserveAndExtractUrlSource`** (`preserve-and-extract-url-source.ts`) — the combined workflow. Runs preservation; on failure returns `{ ok: false, stage: "preservation", error }`. On preservation success, runs extraction; on failure returns `{ ok: false, stage: "extraction", source, error }`. The stage discriminator lets the HTTP layer distinguish preservation validation errors (422) from extraction failures (500).

`src/application/source-extraction/run-source-extraction.ts` wraps a `SourceExtractor` adapter: it allocates an extraction id and timing, calls the extractor, and records the outcome via the domain `recordSourceExtraction` (which validates the descriptor and document). Both success and failure outcomes are returned as a `RecordSourceExtractionResult`.

## Evidence-preparation workflow

`prepareSourceEvidence` loads a successful raw extraction, sends its untrusted metadata and Markdown through the structured-model port, validates the returned document, and appends an immutable successful or failed preparation attempt. Preparation is explicit: it does not run during intake, replace raw evidence, or resolve Source triage. The workflow now tracks how much of the raw extraction was submitted to the model (after capping to fit model limits) via the `capEvidenceMarkdown` helper function. The current adapter is LangChain-backed OpenRouter, but the application boundary is provider-neutral.

## Story workflows

- **`createStory`** (`src/application/story-creation/create-story.ts`) — allocates a `StoryId` and `createdAt`, calls the domain `createStory` (title validation), and persists via `StoryRepository.persist`. Returns the created `Story` or a `STORY_TITLE_REQUIRED` / `STORY_ID_CONFLICT` error.
- **`attachSourceToStory`** (`src/application/story-source-attachment/attach-source-to-story.ts`) — allocates `attachedAt`, calls the domain `attachSourceToStory` (relevance validation), and attaches via `StorySourceAttachmentRepository.attach`. Returns the attachment or `STORY_SOURCE_RELEVANCE_REQUIRED` / `STORY_NOT_FOUND` / `SOURCE_NOT_FOUND` / `STORY_SOURCE_CONFLICT`.

## Story read models

- **`story-inspection`** (`src/application/story-inspection/`) — defines the `StoryInspectionRepository.inspect` port returning `InspectStoryResult`. `StoryInspection` assembles a `Story` with its `StoryInspectionSource[]` (each containing the attachment, the `UrlSource`, and the Source's extraction and preparation attempts), the optional `{ assignment, writerProfile }` pair, the `StoryTransitionReceipt[]` history, the `AgentRun[]` history (including Director runs), the optional `{ article, revisions }` pair, and the `ReviewDecision[]` history in append order. Inspection is the read model the Assignment, Writer, and review workflows use to snapshot evidence and check preconditions.
- **`story-listing`** (`src/application/story-listing/`) — defines the `StoryListingRepository.list` port returning `readonly StoryListItem[]` where each item is `{ story, sourceCount }`.
- **`source-inbox`** (`src/application/source-inbox/`) — defines the `SourceInboxRepository.listPending` port returning `readonly SourceInboxItem[]` where each item is `{ source, extractions }`.

## Source triage workflow

`src/application/source-triage/record-source-triage-decision.ts` — calls the domain `decideSourceTriage` (reason/story consistency validation) and, on success, records via `SourceTriageDecisionRepository.record`. The repository port (`source-triage-repository.ts`) also defines persistence errors: `SOURCE_NOT_FOUND`, `SOURCE_ALREADY_ATTACHED` (an already-attached Source cannot be skipped), `STORY_SOURCE_ATTACHMENT_NOT_FOUND` (a `new_story`/`existing_story` decision requires a pre-existing attachment), and `SOURCE_TRIAGE_CONFLICT` (a different final decision already exists).

## Agent Profile workflow

`src/application/agent-profiles/create-custom-writer-profile.ts` — `createCreateCustomWriterProfile` allocates an `AgentProfileId`, calls the domain `createAgentProfile` with `role: "writer"` and `builtIn: false`, and persists via `AgentProfileRepository.append`. The port (`agent-profile-repository.ts`) also exposes `findById` and `list` and defines `AGENT_PROFILE_ID_CONFLICT`. The built-in profiles are seeded by migration `0027`; only custom Writers are created at runtime.

## Assignment workflow

`src/application/assignments/assign-story.ts` — `createAssignStory` is the authoritative manual Assignment boundary. It:

1. Loads the Story (`STORY_NOT_FOUND`) and the selected Writer Profile (`AGENT_PROFILE_NOT_FOUND`, `AGENT_PROFILE_NOT_WRITER`).
2. Inspects the Story to snapshot every attached Source identity server-side.
3. Calls the domain `createAssignment` (angle/brief/constraints/actor/duplicate validation).
4. Calls `transitionStory` to move `intake` → `assigned` (`INVALID_TRANSITION`, `OPERATOR_REQUIRED`, `REVISION_LIMIT_REACHED`).
5. Persists the Assignment, updated Story, and transition receipt atomically through `AssignmentPersistence.persist`, which surfaces `STORY_ASSIGNMENT_CONFLICT` (the Story was already assigned or its state changed concurrently).

The operator actor is derived from `STORYRAIL_OPERATOR_ID` by the HTTP handler. An Assignment Editor agent is also permitted by the domain (`ASSIGNMENT_ACTOR_NOT_ALLOWED` allows `operator` or `assignment_editor`), but the current HTTP path always attributes the manual Assignment to the operator.

## Assignment Proposal workflow

`src/application/assignment-proposals/generate-assignment-proposal.ts` — `createGenerateAssignmentProposal` produces one supervised `AssignmentProposalAgentRun` for an Intake Story. It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "intake"` and there is no existing Assignment (`ASSIGNMENT_PROPOSAL_NOT_ALLOWED`).
2. Loads the built-in Assignment Editor Profile (`ASSIGNMENT_EDITOR_PROFILE_UNAVAILABLE`) and at least one Writer Profile (`WRITER_PROFILE_REQUIRED`).
3. Selects, for each attached Source, the latest successful Prepared Evidence (falling back to the latest successful raw extraction) and collects `unavailableSourceIds` for Sources with neither; requires at least one selected (`ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED`).
4. Calls the provider-neutral `StructuredModel.generateStructured` with a frozen system prompt (`ASSIGNMENT_EDITOR_PROMPT = { key: "storyrail_assignment_editor", version: "1" }`) and a Zod schema, then validates the parsed output against `createAssignmentProposal` and confirms the chosen Writer is in the candidate set.
5. Builds a candidate `AgentRun` (succeeded with the proposal, or failed with `MODEL_OUTPUT_INVALID` / the model failure) and appends it via `AgentRunRepository.append` (`AGENT_RUN_ID_CONFLICT`).

The proposal is a suggestion only: it prefills the manual Assignment form but cannot create an Assignment or transition Story state.

## Writer draft workflow

`src/application/writer-drafts/create-writer-draft.ts` — `createWriterDraft` runs the assigned Writer against an Assigned Story to produce the first Article. It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "assigned"` (`WRITER_DRAFT_NOT_ALLOWED`), a durable Assignment exists (`ASSIGNMENT_REQUIRED`), and no Article exists yet (`ARTICLE_ALREADY_EXISTS`).
2. Confirms the assigned Writer Profile exists and matches the Assignment (`WRITER_PROFILE_UNAVAILABLE`).
3. Selects evidence from the Assignment's `sourceIds` (latest successful Prepared Evidence, else latest successful raw extraction, else unavailable) and requires at least one (`WRITER_EVIDENCE_REQUIRED`).
4. Resolves the executable model: a Profile OpenRouter model wins, otherwise `STORYRAIL_WRITER_MODEL` is required (`WRITER_MODEL_UNSUPPORTED`, `WRITER_MODEL_UNAVAILABLE`).
5. Calls `StructuredModel.generateStructured` with the frozen `WRITER_DRAFT_PROMPT = { key: "storyrail_writer_draft", version: "1" }` and a `headline`/`dek`/`bodyMarkdown` Zod schema.
6. On failure or invalid output, appends a failed Writer `AgentRun` (operation `article_draft`) and returns `{ ok: true, run }` (the failed run is still durable history). On success, builds the `Article` and `ArticleRevision` (revision number 1) via the domain constructors, transitions the Story `assigned` → `in_progress`, and persists the run, Article, revision, updated Story, and receipt atomically through `WriterDraftPersistence.persist` (`WRITER_DRAFT_CONFLICT`).

If the application produces invalid domain state internally it throws (a programming error) rather than returning a partial result. The Writer cannot browse, use tools, or send work to review.

## Writer revision workflow

`src/application/writer-revisions/create-writer-revision.ts` — `createWriterRevision` runs the assigned Writer against a Changes Requested Story to produce the next immutable Article Revision (2 or 3). It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "changes_requested"` (`WRITER_REVISION_NOT_ALLOWED`), a durable Assignment exists (`ASSIGNMENT_REQUIRED`), a durable Article exists (`ARTICLE_REQUIRED`), and a current Article Revision exists (`ARTICLE_REVISION_REQUIRED`).
2. Rejects unless the current revision's number equals `story.revisionCycle` and is below 3 (`REVIEW_CONTEXT_MISMATCH`) — this bounds the loop at Revision 3.
3. Finds the operator `ReviewDecision` for the current revision and rejects unless it is a `request_changes` decision (`REVIEW_DECISION_REQUIRED`).
4. Resolves the exact Director `AgentRun` referenced by that decision and validates it is a succeeded `editor_in_chief` / `article_review` run matching the current Article and Revision (`REVIEW_CONTEXT_MISMATCH`).
5. Resolves the exact previous Writer `AgentRun` that produced the current revision via `ArticleRevision.agentRunId` (`WRITER_EVIDENCE_UNAVAILABLE`).
6. Confirms the assigned Writer Profile exists and matches the Assignment (`WRITER_PROFILE_UNAVAILABLE`).
7. Re-resolves every `EvidenceReference` recorded by the previous Writer run by its exact preparation or extraction ID from the inspection's Sources; any missing evidence fails safely (`WRITER_EVIDENCE_UNAVAILABLE`) — newer evidence is never substituted, so the revision is built from the same exact evidence behind the reviewed revision.
8. Resolves the executable model through the same `resolveWriterModel` seam as the draft workflow (`WRITER_MODEL_UNSUPPORTED`, `WRITER_MODEL_UNAVAILABLE`).
9. Calls `StructuredModel.generateStructured` with the frozen `WRITER_REVISION_PROMPT = { key: "storyrail_writer_revision", version: "1" }` and a `headline`/`dek`/`bodyMarkdown` Zod schema. The system prompt instructs the Writer to revise only the supplied current Article Revision following the durable Assignment and the operator's authoritative request-changes reason, treating the Director review as advisory context that yields to the operator decision when they differ.
10. On failure or invalid output, appends a failed Writer `AgentRun` (operation `article_revision`) and returns `{ ok: true, run }`. On success, builds the next `ArticleRevision` (revision number +1) via `createArticleRevision`, transitions the Story `changes_requested` → `in_progress` (preserving `revisionCycle`), and persists the run, revision, updated Story, and transition receipt atomically through `WriterRevisionPersistence.persist` (`WRITER_REVISION_CONFLICT`).

Source evidence, Article content, review content, and decision content are untrusted data, never instructions; only the explicitly supplied operator request-changes reason is treated as editorial direction. The Writer cannot browse, use tools, or perform external research. See the [domain model](domain-model.md#articles-and-revisions) for the revision-number bound and the [newsroom UI](newsroom-ui.md) for the operator revision controls.

## Review submission workflow

`src/application/review-submissions/submit-story-review.ts` — `createSubmitStoryReview` is the operator action that sends an In Progress Story to the Director review stage. It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "in_progress"` (`REVIEW_SUBMISSION_NOT_ALLOWED`).
2. Requires a durable Assignment (`ASSIGNMENT_REQUIRED`), a durable Article (`ARTICLE_REQUIRED`), and at least one Article Revision (`ARTICLE_REVISION_REQUIRED`).
3. Calls `transitionStory` to move `in_progress` → `in_review` with the operator actor and a fixed reason.
4. Persists the updated Story and transition receipt atomically through `ReviewSubmissionPersistence.persist` (`REVIEW_SUBMISSION_CONFLICT` if the Story or Article changed concurrently).

This workflow does not contact a model; it is a database-only state transition exposed on the Story runtime.

## Director review workflow

`src/application/director-reviews/run-director-review.ts` — `createRunDirectorReview` produces one supervised advisory `DirectorArticleReviewAgentRun` for an In Review Story. It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "in_review"` (`DIRECTOR_REVIEW_NOT_ALLOWED`).
2. Requires a durable Assignment (`ASSIGNMENT_REQUIRED`), a durable Article (`ARTICLE_REQUIRED`), and a current Article Revision (`ARTICLE_REVISION_REQUIRED`).
3. Rejects if the current revision already has a successful Director review (`DIRECTOR_REVIEW_ALREADY_SUCCEEDED`).
4. Resolves the exact Writer `AgentRun` that produced the current revision via `ArticleRevision.agentRunId` (`DIRECTOR_EVIDENCE_UNAVAILABLE` if the Writer run or its provenance is missing). The Writer run may be an `article_draft` or an `article_revision` operation.
5. Resolves every `EvidenceReference` recorded by that Writer run by its exact preparation or extraction ID from the inspection's Sources; any missing evidence fails safely (`DIRECTOR_EVIDENCE_UNAVAILABLE`) — newer evidence is never substituted.
6. Loads the built-in Director Profile (`DIRECTOR_PROFILE_UNAVAILABLE`) and resolves the executable model: a Profile OpenRouter model wins, otherwise `STORYRAIL_DIRECTOR_MODEL` is required (`DIRECTOR_MODEL_UNSUPPORTED`, `DIRECTOR_MODEL_UNAVAILABLE`).
7. Calls `StructuredModel.generateStructured` with the frozen `DIRECTOR_REVIEW_PROMPT = { key: "storyrail_director_review", version: "1" }`, a versioned system prompt that combines StoryRail's task and prompt-injection boundary with the immutable Director Profile instructions, and a Zod `directorReviewOutputSchema`.
8. Builds a candidate Director `AgentRun` (succeeded with the validated `DirectorReviewRecommendation`, or failed with `MODEL_OUTPUT_INVALID` / the model failure) and appends it via `AgentRunRepository.append` (`DIRECTOR_REVIEW_ALREADY_SUCCEEDED` if a concurrent successful review for the same revision won the uniqueness race; `AGENT_RUN_ID_CONFLICT` for a duplicate id).

The Director is advisory: it records a recommendation, summary, five checks, and optional revision instructions but never mutates the Article or Story. The input snapshot records the exact Assignment, Article, Revision, and evidence references used. Source text and Article content are supplied as untrusted data; the Director cannot browse, use tools, rewrite, or approve durably. See the [domain model](domain-model.md#director-review) for the recommendation validation rules.

## Review decision workflow

`src/application/review-decisions/record-story-review-decision.ts` — `createRecordStoryReviewDecision` is the authoritative operator action that records an approval or request-changes decision and atomically transitions the Story. It:

1. Inspects the Story (`STORY_NOT_FOUND`); rejects unless `story.state === "in_review"` (`REVIEW_DECISION_NOT_ALLOWED`).
2. Requires a durable Article (`ARTICLE_REQUIRED`) and current Article Revision (`ARTICLE_REVISION_REQUIRED`).
3. Rejects if the current revision already has an operator decision (`REVIEW_DECISION_ALREADY_EXISTS`).
4. Finds the referenced Director `AgentRun` by id (`DIRECTOR_REVIEW_REQUIRED`) and validates it is a successful `editor_in_chief` / `article_review` run matching the current Article and Revision (`DIRECTOR_REVIEW_MISMATCH`).
5. Calls the domain `createReviewDecision` to validate the operator-owned decision and reason.
6. Calls `transitionStory`: `approve` → `approved`; `request_changes` → `changes_requested` (incrementing `revisionCycle`, bounded by `MAX_REVISION_CYCLES` — `REVISION_LIMIT_REACHED` if exceeded). Only an operator can make this transition.
7. Persists the ReviewDecision, updated Story, and transition receipt atomically through `ReviewDecisionPersistence.persist` (`REVIEW_DECISION_ALREADY_EXISTS`, `REVIEW_DECISION_ID_CONFLICT`, `REVIEW_DECISION_CONFLICT`).

The operator may override the Director's recommendation (e.g., approve despite a `request_changes` recommendation); the workflow surfaces no error for a disagreement. See the [domain model](domain-model.md#reviewdecision) for the decision validation rules and the [newsroom UI](newsroom-ui.md) for the operator decision controls.

## Story rejection workflow

`src/application/story-rejections/reject-story.ts` — `createRejectStory` is the authoritative operator action that rejects a Story with an attributable reason. It is the first application workflow to exercise the domain's operator-only transitions into the terminal `rejected` state. It:

1. Inspects the Story (`STORY_NOT_FOUND` if the inspection itself fails).
2. Calls `transitionStory` to move the Story from `intake`, `assigned`, `in_progress`, `in_review`, or `changes_requested` → `rejected` (`REASON_REQUIRED`, `INVALID_TRANSITION`, `OPERATOR_REQUIRED`). The domain already permits these five rejected transitions and requires an `operator` actor; the workflow contributes only the reason, actor, transition id, and timestamp.
3. Persists the rejected Story and transition receipt atomically through `StoryRejectionPersistence.persist` (`STORY_REJECTION_CONFLICT` if the Story changed concurrently).

Rejection is terminal and does not contact a model. It preserves all existing work: Sources, attachments, the Assignment, Articles and their revisions, `AgentRun`s, `ReviewDecision`s, and prior transition receipts are untouched — the rejection only appends one new Story row and one new `story_transition_receipts` row. The reason is stored on the durable transition receipt (not a denormalized Story field), so the newsroom reads it from the authoritative transition history after a reload. Rejection is a separate operator-owned Story transition; it is not a `ReviewDecision` and introduces no new domain entity. See the [domain model](domain-model.md#story-and-the-state-machine) for the state machine, the [HTTP API](http-api.md) for the rejection endpoint, and the [newsroom UI](newsroom-ui.md) for the operator rejection controls.

## Story delivery workflow

`src/application/story-deliveries/deliver-story.ts` — `createDeliverStory` sends the latest Article Revision of an approved/published Story to a configured external publishing destination (e.g. StudioCMS).

1. Inspects the Story (`STORY_NOT_FOUND`).
2. Validates that `story.state === "published"` (`STORY_NOT_PUBLISHED`). Only published Stories are delivered.
3. Finds the latest Article Revision (`STORY_HAS_NO_ARTICLE`).
4. Resolves the destination directory (`DeliveryDestinationDirectory`) to construct the destination instance with site settings and credentials.
5. Derives the slug via `storyDeliverySlug(revision.headline)`.
6. Checks previous deliveries for that Story to decide whether this is a `create` (first delivery) or `update` (patching an existing remote page using its prior `remoteId`).
7. **Durability first**: Records the delivery row as `outcome: "running"` with `StoryDeliveryRepository.record` before making the external HTTP call.
8. Invokes `destination.deliver(...)`.
9. Updates the delivery record to `succeeded` with `remoteId` (parsed from the provider response) or `failed` with failure details. Failed deliveries are never retried silently.

## Model catalog workflow

`src/application/model-catalog/model-catalog.ts` provides a filtered model catalog interface (`ModelCatalog`) returning models that support `structured_outputs`. It is used by the settings workspace to populate model selectors for supervised roles without persisting third-party catalog state in the database.

## Site creation workflow

`src/application/sites/create-site.ts` — `createCreateSite` sets up a new independent newsroom:
1. Validates and canonicalizes domain input (`canonicalizeSiteDomain`).
2. Checks domain uniqueness across existing sites via `SiteRepository.findByDomain` (`SITE_DOMAIN_TAKEN`).
3. Allocates `SiteId` and persists the `Site` record.
4. Automatically seeds the four built-in Agent Profiles for the site (`assignment_editor`, `writer`, `editor_in_chief`, `researcher`) via `builtInAgentProfilesForSite`.

## Repository ports

Persistence contracts are expressed as interfaces in the application layer and implemented by PostgreSQL adapters:

| Port                                                 | Application contract                                                             | PostgreSQL adapter                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `UrlSourceRepository` / `SourceExtractionRepository` | `src/application/source-persistence/source-repositories.ts`                      | `src/adapters/source-persistence/postgres-source-repositories.ts`                      |
| `StoryRepository`                                    | `src/application/story-persistence/story-repository.ts`                          | `src/adapters/story-persistence/postgres-story-repository.ts`                          |
| `StorySourceAttachmentRepository`                    | `src/application/story-source-persistence/story-source-attachment-repository.ts` | `src/adapters/story-source-persistence/postgres-story-source-attachment-repository.ts` |
| `StoryInspectionRepository`                          | `src/application/story-inspection/story-inspection-repository.ts`                | `src/adapters/story-inspection/postgres-story-inspection-repository.ts`                |
| `StoryListingRepository`                             | `src/application/story-listing/story-listing-repository.ts`                      | `src/adapters/story-listing/postgres-story-listing-repository.ts`                      |
| `SourceInboxRepository`                              | `src/application/source-inbox/source-inbox-repository.ts`                        | `src/adapters/source-inbox/postgres-source-inbox-repository.ts`                        |
| `SourceTriageDecisionRepository`                     | `src/application/source-triage/source-triage-repository.ts`                      | `src/adapters/source-triage-persistence/postgres-source-triage-decision-repository.ts` |
| `AgentProfileRepository`                             | `src/application/agent-profiles/agent-profile-repository.ts`                     | `src/adapters/agent-profile-persistence/postgres-agent-profile-repository.ts`          |
| `AssignmentPersistence`                              | `src/application/assignments/assignment-persistence.ts`                          | `src/adapters/assignment-persistence/postgres-assignment-persistence.ts`               |
| `AgentRunRepository`                                 | `src/application/agent-runs/agent-run-repository.ts`                             | `src/adapters/agent-run-persistence/postgres-agent-run-repository.ts`                  |
| `WriterDraftPersistence`                              | `src/application/writer-drafts/writer-draft-persistence.ts`                      | `src/adapters/article-persistence/postgres-writer-draft-persistence.ts`                |
| `WriterRevisionPersistence`                           | `src/application/writer-revisions/writer-revision-persistence.ts`                | `src/adapters/article-persistence/postgres-writer-revision-persistence.ts`              |
| `ReviewSubmissionPersistence`                         | `src/application/review-submissions/review-submission-persistence.ts`             | `src/adapters/review-persistence/postgres-review-submission-persistence.ts`            |
| `ReviewDecisionPersistence`                           | `src/application/review-decisions/review-decision-persistence.ts`                 | `src/adapters/review-persistence/postgres-review-decision-persistence.ts`              |
| `StoryRejectionPersistence`                           | `src/application/story-rejections/story-rejection-persistence.ts`                  | `src/adapters/story-rejection-persistence/postgres-story-rejection-persistence.ts`      |
| `StoryDeliveryRepository`                             | `src/application/story-deliveries/story-delivery-repository.ts`                   | `src/adapters/story-delivery-persistence/postgres-story-delivery-repository.ts`        |
| `SiteSettingsRepository`                              | `src/application/site-settings/site-settings-repository.ts`                       | `src/adapters/site-settings-persistence/postgres-site-settings-repository.ts`          |

The `*.contract.ts` files alongside several ports (`source-repositories.contract.ts`, `story-inspection-repository.contract.ts`, `agent-run-repository.contract.ts`, etc.) are shared harnesses that verify any repository implementation satisfies the same behavior contract. The PostgreSQL adapter tests run these contracts against real PostgreSQL in the integration suite.
