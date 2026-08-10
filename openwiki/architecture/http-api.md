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

`StoryInspection` (from `src/application/story-inspection/story-inspection-repository.ts`) assembles the Story with its attached Sources and each Source's extraction attempts.

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
- Response: `{ "ok": true, "sources": SourceInboxItem[] }` where `SourceInboxItem` is `{ source: UrlSource, extractions: SourceExtraction[] }`. Lists preserved Sources that have not yet received a final triage decision.

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

## Handler conventions

- `statusFor*` functions map the discriminated workflow result `error.code` to an HTTP status, so domain error codes are the source of truth for HTTP semantics.
- Frozen constant response objects are reused for the common 415/400/500 errors.
- All handlers are factory functions (`create*Handler`) that accept dependencies including a `getRuntime` thunk, which makes them injectable and testable without touching environment or a real database.
- Next.js route files are intentionally thin: they set `runtime = "nodejs"` and export the factory-built handler as the HTTP method.
