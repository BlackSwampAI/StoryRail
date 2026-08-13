---
type: Reference
title: Application workflows
description: Use-case orchestration layer that composes domain rules with repository ports for Source evidence, Story creation, Source attachment, inspection, listing, inbox, and Source triage.
tags: [application, workflows, use-cases, ports]
---

# Application workflows

The application layer (`src/application`) contains the use-case workflows that orchestrate domain rules with repository ports. Each workflow is a factory function (`create*`) that accepts dependencies and returns the workflow function. Dependencies include repository ports, id factories, and a `now` clock, making workflows injectable and testable without a real database or network.

`src/application/index.ts` also exposes the structured-model boundary, Source evidence-preparation, Agent Profile, Assignment, Assignment Proposal, AgentRun, and Writer draft workflows alongside the Source, triage, and Story modules described below.

## Source-evidence workflows

`src/application/source-evidence/` orchestrates Source preservation and extraction:

1. **`preserveUrlSource`** (`preserve-url-source.ts`) — generates a `SourceId` and `receivedAt`, calls the domain `intakeUrlSource` (canonicalization + duplicate check), and persists via `UrlSourceRepository.persist`. Returns `PreserveUrlSourceResult`.
2. **`extractPersistedSource`** (`extract-persisted-source.ts`) — loads a persisted `UrlSource` by id (`SOURCE_NOT_FOUND` if absent), runs extraction, and appends the result via `SourceExtractionRepository.append`.
3. **`preserveAndExtractUrlSource`** (`preserve-and-extract-url-source.ts`) — the combined workflow. Runs preservation; on failure returns `{ ok: false, stage: "preservation", error }`. On preservation success, runs extraction; on failure returns `{ ok: false, stage: "extraction", source, error }`. The stage discriminator lets the HTTP layer distinguish preservation validation errors (422) from extraction failures (500).

`src/application/source-extraction/run-source-extraction.ts` wraps a `SourceExtractor` adapter: it allocates an extraction id and timing, calls the extractor, and records the outcome via the domain `recordSourceExtraction` (which validates the descriptor and document). Both success and failure outcomes are returned as a `RecordSourceExtractionResult`.

## Evidence-preparation workflow

`prepareSourceEvidence` loads a successful raw extraction, sends its untrusted metadata and Markdown through the structured-model port, validates the returned document, and appends an immutable successful or failed preparation attempt. Preparation is explicit: it does not run during intake, replace raw evidence, or resolve Source triage. The current adapter is LangChain-backed OpenRouter, but the application boundary is provider-neutral.

## Story workflows

- **`createStory`** (`src/application/story-creation/create-story.ts`) — allocates a `StoryId` and `createdAt`, calls the domain `createStory` (title validation), and persists via `StoryRepository.persist`. Returns the created `Story` or a `STORY_TITLE_REQUIRED` / `STORY_ID_CONFLICT` error.
- **`attachSourceToStory`** (`src/application/story-source-attachment/attach-source-to-story.ts`) — allocates `attachedAt`, calls the domain `attachSourceToStory` (relevance validation), and attaches via `StorySourceAttachmentRepository.attach`. Returns the attachment or `STORY_SOURCE_RELEVANCE_REQUIRED` / `STORY_NOT_FOUND` / `SOURCE_NOT_FOUND` / `STORY_SOURCE_CONFLICT`.

## Story read models

- **`story-inspection`** (`src/application/story-inspection/`) — defines the `StoryInspectionRepository.inspect` port returning `InspectStoryResult`. `StoryInspection` assembles a `Story` with its `StoryInspectionSource[]` (each containing the attachment, the `UrlSource`, and the Source's extraction and preparation attempts), the optional `{ assignment, writerProfile }` pair, the `StoryTransitionReceipt[]` history, the `AgentRun[]` history, and the optional `{ article, revisions }` pair. Inspection is the read model the Assignment and Writer workflows use to snapshot evidence and check preconditions.
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
6. On failure or invalid output, appends a failed Writer `AgentRun` and returns `{ ok: true, run }` (the failed run is still durable history). On success, builds the `Article` and `ArticleRevision` (revision number 1) via the domain constructors, transitions the Story `assigned` → `in_progress`, and persists the run, Article, revision, updated Story, and receipt atomically through `WriterDraftPersistence.persist` (`WRITER_DRAFT_CONFLICT`).

If the application produces invalid domain state internally it throws (a programming error) rather than returning a partial result. The Writer cannot browse, use tools, revise, or send work to review.

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
| `WriterDraftPersistence`                             | `src/application/writer-drafts/writer-draft-persistence.ts`                      | `src/adapters/article-persistence/postgres-writer-draft-persistence.ts`                |

The `*.contract.ts` files alongside several ports (`source-repositories.contract.ts`, `story-inspection-repository.contract.ts`, `agent-run-repository.contract.ts`, etc.) are shared harnesses that verify any repository implementation satisfies the same behavior contract. The PostgreSQL adapter tests run these contracts against real PostgreSQL in the integration suite.
