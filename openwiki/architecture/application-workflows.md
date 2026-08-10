---
type: Reference
title: Application workflows
description: Use-case orchestration layer that composes domain rules with repository ports for Source evidence, Story creation, Source attachment, inspection, listing, inbox, and Source triage.
tags: [application, workflows, use-cases, ports]
---

# Application workflows

The application layer (`src/application`) contains the use-case workflows that orchestrate domain rules with repository ports. Each workflow is a factory function (`create*`) that accepts dependencies and returns the workflow function. Dependencies include repository ports, id factories, and a `now` clock, making workflows injectable and testable without a real database or network.

`src/application/index.ts` also exposes the structured-model boundary and Source evidence-preparation workflow alongside the Source, triage, and Story modules described below.

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

- **`story-inspection`** (`src/application/story-inspection/`) — defines the `StoryInspectionRepository.inspect` port returning `InspectStoryResult`. `StoryInspection` assembles a `Story` with its `StoryInspectionSource[]`, each containing the attachment, the `UrlSource`, and the Source's extraction attempts.
- **`story-listing`** (`src/application/story-listing/`) — defines the `StoryListingRepository.list` port returning `readonly StoryListItem[]` where each item is `{ story, sourceCount }`.
- **`source-inbox`** (`src/application/source-inbox/`) — defines the `SourceInboxRepository.listPending` port returning `readonly SourceInboxItem[]` where each item is `{ source, extractions }`.

## Source triage workflow

`src/application/source-triage/record-source-triage-decision.ts` — calls the domain `decideSourceTriage` (reason/story consistency validation) and, on success, records via `SourceTriageDecisionRepository.record`. The repository port (`source-triage-repository.ts`) also defines persistence errors: `SOURCE_NOT_FOUND`, `SOURCE_ALREADY_ATTACHED` (an already-attached Source cannot be skipped), `STORY_SOURCE_ATTACHMENT_NOT_FOUND` (a `new_story`/`existing_story` decision requires a pre-existing attachment), and `SOURCE_TRIAGE_CONFLICT` (a different final decision already exists).

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

The `*.contract.ts` files alongside several ports (`source-repositories.contract.ts`, `story-inspection-repository.contract.ts`, etc.) are shared harnesses that verify any repository implementation satisfies the same behavior contract. The PostgreSQL adapter tests run these contracts against real PostgreSQL in the integration suite.
