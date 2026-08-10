---
type: Reference
title: Newsroom UI shell
description: React client newsroom shell with Story desk, Source-evidence intake, Source inbox, and Story inspection workspaces backed by the HTTP API.
tags: [ui, react, newsroom, nextjs]
---

# Newsroom UI shell

The newsroom is a single-page React client rendered by the Next.js home route. `src/app/page.tsx` renders `<NewsroomShell />`, and `src/app/layout.tsx` sets the document title/metadata. The shell is a client component (`"use client"`) in `src/features/newsroom/`.

## NewsroomShell

`newsroom-shell.tsx` renders two coordinated panels:

- A **desk/queue** listing Stories with their state labels and source counts.
- A **workspace** that switches between four `WorkspaceMode`s: `story`, `source-inbox`, `source-intake`, and `assistant`.

It fetches Stories via `storyClient`, pending Sources via `sourceInboxRequests`, and source-evidence intake via `requestSourceEvidence`. All three are injectable through `NewsroomShellProps` so the component test (`newsroom-shell.test.tsx`) can substitute them.

### State labels

`newsroom-state.ts` exports `STORY_STATE_LABELS`, a `Readonly<Record<StoryState, string>>` mapping the eight domain `STORY_STATES` to human labels (`intake` → "Intake", `in_progress` → "In progress", etc.). Styling is isolated in `newsroom-shell.module.css`.

## Workspaces and clients

| Component                 | File                            | Backed by                                                                                     |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `SourceEvidenceWorkspace` | `source-evidence-workspace.tsx` | `POST /api/source-evidence/url` via `source-evidence-url-client.ts`                           |
| `SourceInboxWorkspace`    | `source-inbox-workspace.tsx`    | `GET /api/source-inbox` and `PUT /api/sources/[sourceId]/triage` via `source-inbox-client.ts` |
| Story inspection views    | `newsroom-shell.tsx`            | `GET /api/stories/[storyId]` via `story-client.ts`                                            |

### Source-evidence intake

`source-evidence-url-client.ts` (`RequestSourceEvidenceUrl`) POSTs `{ submittedUrl }` to `/api/source-evidence/url` and returns the structured `PreserveAndExtractUrlSourceResult`, surfacing preservation validation errors (422) distinctly from extraction failures (500). `source-evidence-workspace.tsx` renders the preserved Source and its extraction attempts, including the persisted extraction receipt (extractor descriptor, timing, success/failure, and the extracted Markdown document with title/language). The workspace preserves surrounding whitespace and HTML-like content in displayed Markdown, treating extracted content as untrusted evidence.

### Source inbox and triage

`source-inbox-client.ts` lists pending Sources, requests explicit evidence preparation, and records triage decisions. `source-inbox-workspace.tsx` displays immutable raw and prepared histories, lets the operator prepare a successful extraction, and supports `new_story`, `existing_story`, or `skip` for each pending Source. Every triage choice requires a reason; Story choices create or use the required attachment before the final decision is recorded.

### Story client

`story-client.ts` creates Stories, lists them, inspects a selected Story, and attaches Sources. Story inspection prioritizes successful Prepared Evidence while retaining the raw extraction and technical histories. `newsroom-shell.tsx` uses `actorLabel` to render operator/agent provenance and `safeUrl` to validate displayed URLs before rendering them as links.

## Safety posture

The UI treats all retrieved web content as untrusted evidence, never as instructions. Displayed Markdown preserves source structure and links but is not rendered as executable content. The shell is story-centered: a URL is only a potential Source and does not automatically deserve coverage.
