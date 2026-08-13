---
type: Reference
title: HTTP API endpoints
description: Next.js route handlers for Source intake, Prepared Evidence, Story management, Source inbox, and triage, with request shapes and status code maps.
tags: [http-api, rest, endpoints, interface]
---

# HTTP API endpoints

StoryRail exposes its workflows through hand-rolled HTTP handlers in `src/interfaces/http`, bound to Next.js route handlers under `src/app/api`. All handlers return JSON with `Cache-Control: no-store`. Request bodies must be `application/json`; a missing or non-JSON media type yields `415 UNSUPPORTED_MEDIA_TYPE` and invalid JSON yields `400 INVALID_JSON`. Handler-level body shape validation yields `400 INVALID_REQUEST` when the object does not have the exact expected keys and types.

Three lazy server providers back the routes:

- `sourceEvidenceRuntimeProvider` (`src/server/source-evidence-runtime-provider.ts`) — builds the Source-evidence runtime on first use.
- `evidencePreparationRuntimeProvider` (`src/server/evidence-preparation-runtime-provider.ts`) — builds the model-backed preparation runtime on first use.
- `storyRuntimeProvider` (`src/server/story-runtime-provider.ts`) — builds the Story runtime on first use.
- `assignmentEditorRuntimeProvider` (`src/server/assignment-editor-runtime-provider.ts`) — builds the Assignment-editor runtime on first use.
- `writerRuntimeProvider` (`src/server/writer-runtime-provider.ts`) — builds the Writer runtime on first use.

## POST /api/sources/[sourceId]/preparations — prepare evidence

- Route: `src/app/api/sources/[sourceId]/preparations/route.ts`
- Handler: `src/interfaces/http/prepare-source-evidence-handler.ts`
- Body: `{ "extractionId": string }`
- Workflow: explicitly prepares one successful raw extraction through the configured OpenRouter model and appends the successful or failed immutable attempt. It does not replace raw evidence or resolve triage.

## POST /api/source-evidence/url — preserve and extract a URL Source

- Route: `src/app/api/source-evidence/url/route.ts`
- Handler: `src/interfaces/http/preserve-and-extract-url-source-handler.ts`
- Provider: `sourceEvidenceRuntimeProvider`
- Body: `{ "submittedUrl": string }` (exactly one string property)
- Workflow: `preserveAndExtractUrlSource` (preservation then extraction). The operator actor is derived from `STORYRAIL_OPERATOR_ID`.

Status codes:

| Status | Condition                                                                                                                                                               |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201    | Source preserved and extraction completed (success or failure outcome recorded)                                                                                         |
| 415    | Missing/invalid `Content-Type`                                                                                                                                          |
| 400    | Invalid JSON or invalid request shape                                                                                                                                   |
| 422    | Preservation validation error (`SOURCE_URL_REQUIRED`, `SOURCE_URL_TOO_LONG`, `INVALID_SOURCE_URL`, `UNSUPPORTED_SOURCE_PROTOCOL`, `SOURCE_URL_CREDENTIALS_NOT_ALLOWED`) |
| 409    | Preservation duplicate/conflict (`DUPLICATE_SOURCE`, `SOURCE_ID_CONFLICT`)                                                                                              |
| 500    | Extraction-stage failure or internal server error                                                                                                                       |

## POST /api/stories — create a Story

- Route: `src/app/api/stories/route.ts`
- Handler: `src/interfaces/http/create-story-handler.ts`
- Provider: `storyRuntimeProvider`
- Body: `{ "title": string }` (exactly one string property)
- Workflow: `createStory`

| Status  | Condition                               |
| ------- | --------------------------------------- |
| 201     | Story created                           |
| 409     | Story id conflict (`STORY_ID_CONFLICT`) |
| 422     | Empty title (`STORY_TITLE_REQUIRED`)    |
| 415/400 | Media type / JSON / shape errors        |
| 500     | Internal server error                   |

## GET /api/stories — list Stories

- Route: `src/app/api/stories/route.ts`
- Handler: `src/interfaces/http/list-stories-handler.ts`
- Provider: `storyRuntimeProvider`
- Response: `{ "ok": true, "stories": StoryListItem[] }` where `StoryListItem` is `{ story: Story, sourceCount: number }`

Always returns 200 on success or 500 on internal failure.

## GET /api/stories/[storyId] — inspect a Story

- Route: `src/app/api/stories/[storyId]/route.ts`
- Handler: `src/interfaces/http/inspect-story-handler.ts`
- Provider: `storyRuntimeProvider`
- Response: the full `InspectStoryResult` (`{ ok: true, inspection: StoryInspection }` on 200, or `{ ok: false, error: { code: "STORY_NOT_FOUND" } }` on 404).

`StoryInspection` (from `src/application/story-inspection/story-inspection-repository.ts`) assembles the Story with its attached Sources, the optional `{ assignment, writerProfile }` pair, the `StoryTransitionReceipt[]` history, the `AgentRun[]` history, and the optional `{ article, revisions }` pair. Each Source entry contains `{ attachment, source, extractions, preparations }`, preserving both raw extraction attempts and derived preparation attempts.

## POST /api/stories/[storyId]/sources — attach a Source to a Story

- Route: `src/app/api/stories/[storyId]/sources/route.ts`
- Handler: `src/interfaces/http/attach-source-to-story-handler.ts`
- Provider: `storyRuntimeProvider`
- Body: `{ "sourceId": string, "relevance": string }` (exactly two string properties)
- The operator actor is derived from `STORYRAIL_OPERATOR_ID`.

| Status  | Condition                               |
| ------- | --------------------------------------- |
| 200     | Source attached                         |
| 404     | `STORY_NOT_FOUND` or `SOURCE_NOT_FOUND` |
| 409     | `STORY_SOURCE_CONFLICT`                 |
| 422     | `STORY_SOURCE_RELEVANCE_REQUIRED`       |
| 415/400 | Media type / JSON / shape errors        |
| 500     | Internal server error                   |

## GET /api/source-inbox — list pending Sources

- Route: `src/app/api/source-inbox/route.ts`
- Handler: `src/interfaces/http/list-source-inbox-handler.ts`
- Provider: `storyRuntimeProvider`
- Response: `{ "ok": true, "sources": SourceInboxItem[] }` where each `SourceInboxItem` contains `{ source, extractions, preparations }`. A Source is pending only when it has no final triage decision **and** no Story attachment.

## PUT /api/sources/[sourceId]/triage — record a Source triage decision

- Route: `src/app/api/sources/[sourceId]/triage/route.ts`
- Handler: `src/interfaces/http/record-source-triage-decision-handler.ts`
- Provider: `storyRuntimeProvider`
- Body: `{ "decision": "new_story" | "existing_story" | "skip", "storyId": string | null, "reason": string }` (exactly three properties). `STORYRAIL_OPERATOR_ID` must be configured or the handler returns 500.

| Status  | Condition                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------ |
| 200     | Decision recorded                                                                                |
| 404     | `SOURCE_NOT_FOUND`                                                                               |
| 422     | `SOURCE_TRIAGE_REASON_REQUIRED`, `SOURCE_TRIAGE_STORY_REQUIRED`, `SOURCE_TRIAGE_STORY_FORBIDDEN` |
| 409     | `SOURCE_ALREADY_ATTACHED`, `STORY_SOURCE_ATTACHMENT_NOT_FOUND`, `SOURCE_TRIAGE_CONFLICT`         |
| 415/400 | Media type / JSON / shape errors                                                                 |
| 500     | Missing `STORYRAIL_OPERATOR_ID` or internal error                                                |

## GET /api/agent-profiles — list Agent Profiles

- Route: `src/app/api/agent-profiles/route.ts`
- Handler: `src/interfaces/http/list-agent-profiles-handler.ts`
- Provider: `storyRuntimeProvider`
- Response: `{ "ok": true, "profiles": AgentProfile[] }` (built-in and custom Writers, the Assignment Editor, and the Director).

Always returns 200 on success or 500 on internal failure.

## POST /api/agent-profiles — create a custom Writer Profile

- Route: `src/app/api/agent-profiles/route.ts`
- Handler: `src/interfaces/http/create-custom-writer-profile-handler.ts`
- Provider: `storyRuntimeProvider`
- Body: `{ "name": string, "instructions": string, "model": { "provider": string, "model": string } | null }` (exactly three properties). A null `model` means the Writer uses the runtime default.

| Status  | Condition                                                                                                                                                         |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201     | Profile created                                                                                                                                                   |
| 409     | `AGENT_PROFILE_ID_CONFLICT`                                                                                                                                       |
| 422     | `AGENT_PROFILE_ROLE_UNSUPPORTED`, `AGENT_PROFILE_NAME_REQUIRED`, `AGENT_PROFILE_INSTRUCTIONS_REQUIRED`, `AGENT_PROFILE_MODEL_*`, `AGENT_PROFILE_BUILT_IN_INVALID` |
| 415/400 | Media type / JSON / shape errors                                                                                                                                  |
| 500     | Internal server error                                                                                                                                             |

## POST /api/stories/[storyId]/assignment-proposals — generate an Assignment Editor proposal

- Route: `src/app/api/stories/[storyId]/assignment-proposals/route.ts`
- Handler: `src/interfaces/http/generate-assignment-proposal-handler.ts`
- Provider: `assignmentEditorRuntimeProvider`
- Body: `{}` (exactly an empty object). `STORYRAIL_OPERATOR_ID` must be configured or the handler returns 500.
- Workflow: `generateAssignmentProposal`. Records one immutable `AgentRun` (succeeded proposal or safe failure). It does not create an Assignment or transition Story state; the operator reviews the suggestion in the manual Assignment form.

| Status | Condition                                                                                         |
| ------ | ------------------------------------------------------------------------------------------------- |
| 201    | Proposal `AgentRun` recorded (succeeded or failed outcome)                                        |
| 404    | `STORY_NOT_FOUND`                                                                                 |
| 409    | `ASSIGNMENT_PROPOSAL_NOT_ALLOWED` (Story not Intake or already assigned), `AGENT_RUN_ID_CONFLICT` |
| 422    | `ASSIGNMENT_EDITOR_EVIDENCE_REQUIRED`, `WRITER_PROFILE_REQUIRED`                                  |
| 500    | `ASSIGNMENT_EDITOR_PROFILE_UNAVAILABLE`, missing `STORYRAIL_OPERATOR_ID`, or internal error       |
| 503    | Assignment-editor runtime not configured (`ASSIGNMENT_EDITOR_UNAVAILABLE`)                        |

## POST /api/stories/[storyId]/assignments — create a durable Assignment

- Route: `src/app/api/stories/[storyId]/assignments/route.ts`
- Handler: `src/interfaces/http/assign-story-handler.ts`
- Provider: `storyRuntimeProvider`
- Body: `{ "writerProfileId": string, "angle": string, "brief": string, "constraints": string | null, "reason": string }` (exactly five properties). The operator actor is derived from `STORYRAIL_OPERATOR_ID`.
- Workflow: `assignStory`. Validates the Story and Writer Profile, snapshots every attached Source identity from the authoritative inspection, creates the Assignment, and atomically transitions the Story `intake` → `assigned` with a durable transition receipt.

| Status  | Condition                                                                                                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201     | Assignment and transition persisted                                                                                                                                                                                         |
| 404     | `STORY_NOT_FOUND`, `AGENT_PROFILE_NOT_FOUND`                                                                                                                                                                                |
| 409     | `INVALID_TRANSITION` (Story not Intake), `STORY_ASSIGNMENT_CONFLICT` (Story already assigned)                                                                                                                               |
| 422     | `ASSIGNMENT_ANGLE_REQUIRED`, `ASSIGNMENT_BRIEF_REQUIRED`, `ASSIGNMENT_CONSTRAINTS_INVALID`, `ASSIGNMENT_WRITER_PROFILE_REQUIRED`, `ASSIGNMENT_ACTOR_NOT_ALLOWED`, `ASSIGNMENT_SOURCE_DUPLICATE`, `AGENT_PROFILE_NOT_WRITER` |
| 415/400 | Media type / JSON / shape errors                                                                                                                                                                                            |
| 500     | Missing `STORYRAIL_OPERATOR_ID` or internal error                                                                                                                                                                           |

## POST /api/stories/[storyId]/writer-drafts — run the Writer and create the first Article

- Route: `src/app/api/stories/[storyId]/writer-drafts/route.ts`
- Handler: `src/interfaces/http/create-writer-draft-handler.ts`
- Provider: `writerRuntimeProvider`
- Body: `{}` (exactly an empty object). `STORYRAIL_OPERATOR_ID` must be configured or the handler returns 500.
- Workflow: `createWriterDraft`. Validates the Story is Assigned with a durable Assignment and no existing Article, resolves the executable Writer model, runs the supervised Writer against the Assignment's evidence snapshot, records a Writer `AgentRun`, creates the first Article and immutable Revision 1, and atomically transitions the Story `assigned` → `in_progress`. A failed model invocation records a failed `AgentRun` and returns success with the failed run (no Article is created).

| Status | Condition                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 201    | Writer `AgentRun` recorded (succeeded with Article/Revision, or failed run)                                                                        |
| 404    | `STORY_NOT_FOUND`                                                                                                                                  |
| 409    | `WRITER_DRAFT_NOT_ALLOWED` (Story not Assigned), `ASSIGNMENT_REQUIRED`, `ARTICLE_ALREADY_EXISTS`, `WRITER_DRAFT_CONFLICT`, `AGENT_RUN_ID_CONFLICT` |
| 422    | `WRITER_EVIDENCE_REQUIRED`                                                                                                                         |
| 500    | `WRITER_MODEL_UNSUPPORTED`, `WRITER_PROFILE_UNAVAILABLE`, missing `STORYRAIL_OPERATOR_ID`, or internal error                                       |
| 503    | Writer runtime not configured (`WRITER_UNAVAILABLE`) or `WRITER_MODEL_UNAVAILABLE`                                                                 |

## Handler conventions

- `statusFor*` functions map the discriminated workflow result `error.code` to an HTTP status, so domain error codes are the source of truth for HTTP semantics.
- Frozen constant response objects are reused for the common 415/400/500 errors.
- All handlers are factory functions (`create*Handler`) that accept dependencies including a `getRuntime` thunk, which makes them injectable and testable without touching environment or a real database.
- Next.js route files are intentionally thin: they set `runtime = "nodejs"` and export the factory-built handler as the HTTP method.
