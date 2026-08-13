---
type: Reference
title: Newsroom UI shell
description: Resizable React newsroom workbench with a Story desk, Source-evidence intake, Source inbox, Agent Profiles, and a Story workspace covering assignment, Writer execution, and Article reading.
tags: [ui, react, newsroom, nextjs]
---

# Newsroom UI shell

The newsroom is a single-page React client rendered by the Next.js home route. `src/app/page.tsx` renders `<NewsroomShell />`, and `src/app/layout.tsx` sets the document title/metadata. The shell is a client component (`"use client"`) in `src/features/newsroom/`.

## NewsroomShell

`newsroom-shell.tsx` renders a `ResizableNewsroomLayout` with two panels: a **desk** and a **workspace**. The desk header shows the StoryRail identity: an "Alpha preview" eyebrow and a branded `next/image` logo (`/public/logo.png`, `alt="StoryRail"`, `preload`) framed in `deskLogoFrame`/`deskLogo`, replacing the earlier text wordmark. Below it, Source navigation is led by a primary **Add Source** action button (`.addSourceAction`, with a `+` mark) that opens the `source-intake` workspace and carries `aria-current="page"` when active; the **Inbox** remains a secondary nav button with a pending-Source count and its own `aria-current`. The desk also holds the Stories queue grouped by `StoryState` with expandable counts, a People section, and the `NewsroomStaff` roster. The workspace switches between four `WorkspaceMode`s: `story`, `source-inbox`, `source-intake`, and `agents`.

It fetches Stories via `storyClient`, pending Sources via `sourceInboxRequests`, source-evidence intake via `requestSourceEvidence`, and staff via `agentProfileRequests`. All four are injectable through `NewsroomShellProps` so the component test (`newsroom-shell.test.tsx`) can substitute them. The shell wraps the layout in a `DragDropProvider` so a Writer Profile card can be dragged onto an Intake Story workspace to start an Assignment. The shell also exposes `upsertStaffProfile(profile)`, which merges a created or updated `AgentProfile` into the loaded `StaffState` (deduplicating by id) so the Staff roster reflects newly created Writers without a refetch; the `AgentProfilesWorkspace` consumes this through its `onProfileCreated` prop.

### State labels

`newsroom-state.ts` exports `STORY_STATE_LABELS`, a `Readonly<Record<StoryState, string>>` mapping the eight domain `STORY_STATES` to human labels (`intake` → "Intake", `in_progress` → "In progress", etc.). Styling is isolated in `newsroom-shell.module.css`.

## Resizable layout

`resizable-newsroom-layout.tsx` (`ResizableNewsroomLayout`) uses `react-resizable-panels` to offer a draggable desk/workspace split on desktop (min-width 52.001rem) and a stacked layout below it. The persisted desk/workspace proportions are stored under `localStorage` key `storyrail:newsroom-desk-layout:v1`; `parseDeskLayout` validates the restored JSON (two finite positive numbers summing to ~100) before applying it.

## Newsroom staff

`newsroom-staff.tsx` (`NewsroomStaff`) loads and renders the Agent Profile roster as `StaffState` (`loading` / `loaded` / `unavailable`). Built-in profiles are ordered Assignment Editor, General Writer, Director, then custom Writers by name. Each Writer card is a `@dnd-kit/react` draggable source (`WRITER_DRAG_TYPE`, drag handle visible only for Writers); non-Writer profiles render as static cards. The drag data carries the full `AgentProfile` so the Story workspace can create an Assignment from the dropped Writer.

## Workspaces and clients

| Component                 | File                            | Backed by                                                                                                                                          |
| ------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SourceEvidenceWorkspace` | `source-evidence-workspace.tsx` | `POST /api/source-evidence/url` via `source-evidence-url-client.ts`, then `POST /api/sources/[sourceId]/preparations` via `source-inbox-client.ts` |
| `SourceInboxWorkspace`    | `source-inbox-workspace.tsx`    | `GET /api/source-inbox`, `POST /api/sources/[sourceId]/preparations`, and `PUT /api/sources/[sourceId]/triage` via `source-inbox-client.ts`        |
| `StoryWorkspace`          | `story-workspace.tsx`           | `GET /api/stories/[storyId]`, `POST .../assignment-proposals`, `POST .../assignments`, `POST .../writer-drafts` via `story-client.ts`              |
| `AgentProfilesWorkspace`  | `agent-profiles-workspace.tsx`  | `GET/POST /api/agent-profiles` via `agent-profile-client.ts`                                                                                       |
| `ArticleReader`           | `article-reader.tsx`            | Renders an `ArticleRevision` through `SafeMarkdown`                                                                                                |

### Source-evidence intake

`source-evidence-url-client.ts` (`RequestSourceEvidenceUrl`) POSTs `{ submittedUrl }` to `/api/source-evidence/url` and returns the structured `PreserveAndExtractUrlSourceResult`, surfacing preservation validation errors (422) distinctly from extraction failures (500). `source-evidence-workspace.tsx` drives an integrated intake state machine: `idle` → `preserving` → `preparing` → `review` → `result`. After a successful preserve+extract, it automatically requests Prepared Evidence through `source-inbox-client.ts`, then presents an `EvidenceReview` with the prepared document, provenance, and immutable histories. `onSourceAvailable` bumps the inbox refresh counter and `onReviewInInbox` switches the shell to the Source Inbox focused on that Source. Extraction and preparation Markdown is rendered through `SafeMarkdown`.

### Source inbox and triage

`source-inbox-client.ts` lists pending Sources, requests explicit evidence preparation, and records triage decisions. `source-inbox-workspace.tsx` displays immutable raw and prepared histories, lets the operator prepare a successful extraction, and supports `new_story`, `existing_story`, or `skip` for each pending Source. Every triage choice requires a reason; Story choices create or use the required attachment before the final decision is recorded.

### Story workspace, assignment, and Writer execution

`story-workspace.tsx` (`StoryWorkspace`) is the state-aware workspace for a selected Story inspection. It renders the Story state, attached Sources with raw/prepared evidence histories, the Assignment Editor and Writer `AgentRun` audit histories, and — when an Article exists — the `ArticleReader`. It also owns the drag-and-drop Assignment flow:

- `useDroppable` with `WRITER_ASSIGNMENT_DROP_ID` accepts a dropped Writer Profile (`isWriterDropEligible`, `resolveWriterDropSelection`).
- The operator may request a supervised Assignment Editor suggestion (`generateAssignmentProposal`), whose proposal prefills the Assignment form but does not mutate state. The suggestion renders as an `editorialBrief`: an **Angle** section, a **Brief** section, a collapsible `<details>` **Constraints** disclosure, and an **Why this assignment** rationale `aside`.
- Submitting the Assignment form calls `assignStory`; `onAssigned` updates the desk and inspection and refreshes.
- Once Assigned, the **Assignment ready** summary shows the assigned Writer as an `assignedWriter` heading followed by the same `editorialBrief` (Angle, Brief, Constraints disclosure). The operator may run the Writer (`createWriterDraft`); on success `onWriterCompleted` refreshes the inspection, which now includes the Article and the `assigned` → `in_progress` transition.

`story-client.ts` creates Stories, lists them, inspects a selected Story, attaches Sources, assigns Stories, generates Assignment Editor proposals, and creates Writer drafts. `newsroom-shell.tsx` uses `actorLabel` to render operator/agent provenance and `safeUrl` to validate displayed URLs before rendering them as links.

### Agent Profiles workspace

`agent-profiles-workspace.tsx` lists all profiles (built-in and custom) and offers a form to create a custom Writer Profile with an optional `{ provider, model }` OpenRouter model selection. `agent-profile-client.ts` (`AgentProfileClient`) wraps `GET/POST /api/agent-profiles` with strict shape validation of every returned `AgentProfile`. A Writer Profile whose `model` is `null` is labeled "Newsroom default at execution", meaning the Writer runtime's default model will be resolved at run time. The workspace accepts an optional `onProfileCreated?: (profile: AgentProfile) => void` callback, invoked with the persisted profile after a successful creation; `NewsroomShell` wires this to `upsertStaffProfile` so the Staff roster shows the new Writer immediately and without duplicates.

## SafeMarkdown

`safe-markdown.tsx` (`SafeMarkdown`) is a hand-rolled, dependency-free Markdown renderer used for all untrusted editorial content (extracted evidence, prepared evidence, and Article bodies). It supports headings, code fences, blockquotes, horizontal rules, ordered/unordered lists, and inline code/strong/em/link syntax. Links are sanitized through a URL allow-list (`http:`, `https:`, `mailto:`) and rendered with `rel="noopener noreferrer"`. It deliberately preserves source whitespace and structure rather than reflowing evidence.

## Safety posture

The UI treats all retrieved web content and model output as untrusted evidence, never as instructions. Displayed Markdown preserves source structure and links but is rendered only through `SafeMarkdown`, never as executable content. The shell is story-centered: a URL is only a potential Source and does not automatically deserve coverage, and an Assignment Editor suggestion is only a prefill that cannot create an Assignment or transition a Story.
