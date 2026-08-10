import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  storyId,
  STORY_STATES,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import { NEWSROOM_QUEUES, NEWSROOM_STORIES, STORY_STATE_LABELS } from "./newsroom-fixtures";
import { NewsroomShell } from "./newsroom-shell";
import type {
  RequestSourceEvidenceUrl,
  SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import type { StoryClient } from "./story-client";

const sourceCanonicalization = canonicalizeSourceUrl("https://example.com/newsroom-source");

if (!sourceCanonicalization.ok) {
  throw new Error("The shell Source fixture URL must be canonicalizable.");
}

const SOURCE_ACTOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-shell-0016"),
} as const);
const SHELL_SOURCE = Object.freeze({
  id: sourceId("source-shell-0016"),
  type: "url",
  submittedUrl: "https://example.com/newsroom-source",
  canonicalUrl: sourceCanonicalization.canonicalUrl,
  submittedBy: SOURCE_ACTOR,
  receivedAt: "2026-08-09T20:00:00.000Z",
} satisfies UrlSource);
const SHELL_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-shell-0016"),
  sourceId: SHELL_SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: SOURCE_ACTOR,
  startedAt: "2026-08-09T20:00:01.000Z",
  completedAt: "2026-08-09T20:00:02.000Z",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Shell receipt",
    title: "Shell receipt",
    byline: null,
    publishedAt: null,
    language: "en",
  }),
} satisfies SourceExtraction);
const SHELL_RESULT = Object.freeze({
  kind: "completed",
  source: SHELL_SOURCE,
  extraction: SHELL_EXTRACTION,
} satisfies SourceEvidenceUrlResult);
const PERSISTED_STORY = Object.freeze({
  id: storyId("story-real-0021"),
  title: "A persisted newsroom Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "2026-08-09T21:00:00.000Z",
  updatedAt: "2026-08-09T21:00:00.000Z",
} as const);
const PERSISTED_ATTACHMENT = Object.freeze({
  storyId: PERSISTED_STORY.id,
  sourceId: SHELL_SOURCE.id,
  relevance: "Confirms the central report.",
  attachedBy: SOURCE_ACTOR,
  attachedAt: "2026-08-09T21:01:00.000Z",
} as const);

function controlledStoryRequests(): StoryClient {
  return {
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: PERSISTED_STORY,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "completed",
      value: PERSISTED_ATTACHMENT,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: {
        story: PERSISTED_STORY,
        sources: [{ attachment: PERSISTED_ATTACHMENT, source: SHELL_SOURCE }],
      },
    })),
  };
}

function controlledSourceRequest(): ReturnType<typeof vi.fn<RequestSourceEvidenceUrl>> {
  return vi.fn<RequestSourceEvidenceUrl>(async () => SHELL_RESULT);
}

function queueButton(state: (typeof STORY_STATES)[number]) {
  const queue = NEWSROOM_QUEUES.find((candidate) => candidate.state === state);

  if (!queue) {
    throw new Error(`Missing fixture queue for ${state}.`);
  }

  const storyLabel = queue.count === 1 ? "story" : "stories";

  return screen.getByRole("button", {
    name: `${queue.label}, ${queue.count} ${storyLabel}`,
  });
}

describe("NewsroomShell", () => {
  it("renders all eight domain queues with counts derived from the fixtures", () => {
    render(<NewsroomShell />);

    const navigation = screen.getByRole("navigation", { name: "Story state queues" });
    expect(within(navigation).getByText("Preview queues · fixture data")).toBeVisible();

    expect(within(navigation).getAllByRole("button")).toHaveLength(STORY_STATES.length);

    for (const state of STORY_STATES) {
      const expectedCount = NEWSROOM_STORIES.filter((story) => story.state === state).length;
      const storyLabel = expectedCount === 1 ? "story" : "stories";

      expect(
        within(navigation).getByRole("button", {
          name: `${STORY_STATE_LABELS[state]}, ${expectedCount} ${storyLabel}`,
        }),
      ).toBeVisible();
    }
  });

  it("selects intake and its first Story initially", () => {
    render(<NewsroomShell />);

    const firstIntakeStory = NEWSROOM_STORIES.find((story) => story.state === "intake");

    expect(firstIntakeStory).toBeDefined();
    expect(queueButton("intake")).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("button", { name: new RegExp(firstIntakeStory!.title) }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: firstIntakeStory!.title })).toBeVisible();
  });

  it("filters the Story list and selects the first Story when another queue is chosen", () => {
    render(<NewsroomShell />);

    fireEvent.click(queueButton("assigned"));

    const assignedStories = NEWSROOM_STORIES.filter((story) => story.state === "assigned");
    const intakeStory = NEWSROOM_STORIES.find((story) => story.state === "intake");

    expect(queueButton("assigned")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Assigned Stories" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: new RegExp(assignedStories[0].title) }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("button", { name: new RegExp(intakeStory!.title) }),
    ).not.toBeInTheDocument();
  });

  it("updates the workspace when another Story is selected", () => {
    render(<NewsroomShell />);

    fireEvent.click(queueButton("in_progress"));

    const inProgressStories = NEWSROOM_STORIES.filter((story) => story.state === "in_progress");
    const secondStory = inProgressStories[1];
    const secondStoryButton = screen.getByRole("button", { name: new RegExp(secondStory.title) });

    fireEvent.click(secondStoryButton);

    expect(secondStoryButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: secondStory.title })).toBeVisible();
    expect(screen.getByText(secondStory.summary)).toBeVisible();
  });

  it("clears the selected Story and shows deliberate empty states for an empty queue", () => {
    render(<NewsroomShell />);

    fireEvent.click(queueButton("published"));

    expect(screen.getByRole("status")).toHaveTextContent("No Stories in published.");
    expect(screen.getByRole("heading", { name: "No Story selected" })).toBeVisible();
    expect(screen.queryByText("Selected Story")).not.toBeInTheDocument();
  });

  it("shows the disconnected Assistant and restores the selected Story on return", () => {
    render(<NewsroomShell />);

    fireEvent.click(queueButton("in_progress"));
    const selectedStory = NEWSROOM_STORIES.filter((story) => story.state === "in_progress")[1];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(selectedStory.title) }));

    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));

    expect(screen.getByText("Not connected yet")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Agent activity will appear here" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: selectedStory.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Story" }));

    expect(screen.getByRole("heading", { name: selectedStory.title })).toBeVisible();
  });

  it("renders revision-cycle information for a revised Story", () => {
    render(<NewsroomShell />);

    fireEvent.click(queueButton("changes_requested"));

    const revisionFact = screen.getByText("Revision cycle").closest("div");

    expect(revisionFact).toHaveTextContent(/Revision cycle\s*2/);
  });

  it("uses buttons for all selections without making Story cards draggable", () => {
    render(<NewsroomShell />);

    expect(queueButton("intake").tagName).toBe("BUTTON");
    expect(screen.getByRole("button", { name: "Story" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Assistant" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const firstStory = NEWSROOM_STORIES.find((story) => story.state === "intake");
    const firstStoryButton = screen.getByRole("button", { name: new RegExp(firstStory!.title) });

    expect(firstStoryButton.tagName).toBe("BUTTON");
    expect(firstStoryButton).not.toHaveAttribute("draggable");
  });

  it("does not mutate fixture Story states during interactions", () => {
    const statesBefore = NEWSROOM_STORIES.map((story) => story.state);

    render(<NewsroomShell />);

    fireEvent.click(queueButton("in_progress"));
    const secondStory = NEWSROOM_STORIES.filter((story) => story.state === "in_progress")[1];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(secondStory.title) }));
    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    fireEvent.click(screen.getByRole("button", { name: "Story" }));
    fireEvent.click(queueButton("published"));

    expect(NEWSROOM_STORIES.map((story) => story.state)).toEqual(statesBefore);
  });

  it("offers three semantic workspace buttons with Story selected initially", () => {
    render(<NewsroomShell requestSourceEvidence={controlledSourceRequest()} />);

    const workspace = screen.getByRole("group", { name: "Workspace view" });
    const controls = within(workspace).getAllByRole("button");
    expect(controls).toHaveLength(3);
    expect(controls.map((control) => control.textContent)).toEqual([
      "Story",
      "Source intake",
      "Assistant",
    ]);
    expect(within(workspace).getByRole("button", { name: "Story" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.queryByRole("heading", { name: "Preserve one URL as Source evidence" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Source URL" })).not.toBeInTheDocument();
  });

  it("shows connected Source intake without changing the selected queue or Story", () => {
    render(<NewsroomShell requestSourceEvidence={controlledSourceRequest()} />);
    fireEvent.click(queueButton("in_progress"));
    const selectedStory = NEWSROOM_STORIES.filter((story) => story.state === "in_progress")[1];
    const storyButton = screen.getByRole("button", { name: new RegExp(selectedStory.title) });
    fireEvent.click(storyButton);

    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));

    expect(
      screen.getByRole("heading", { name: "Preserve one URL as Source evidence" }),
    ).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Source URL" })).toBeVisible();
    expect(queueButton("in_progress")).toHaveAttribute("aria-current", "page");
    expect(storyButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: selectedStory.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Story" }));
    expect(screen.getByRole("heading", { name: selectedStory.title })).toBeVisible();
  });

  it("keeps Source state and receipt mounted across workspace switching", async () => {
    const request = controlledSourceRequest();
    render(<NewsroomShell requestSourceEvidence={request} />);
    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    const input = screen.getByRole("textbox", { name: "Source URL" });
    fireEvent.change(input, { target: { value: SHELL_SOURCE.submittedUrl } });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));

    expect(await screen.findByText("Source preserved and extraction completed")).toBeVisible();
    expect(request).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    expect(screen.getByText("Not connected yet")).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Source URL" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    expect(screen.getByRole("textbox", { name: "Source URL" })).toHaveValue(
      SHELL_SOURCE.submittedUrl,
    );
    expect(screen.getByText("Source preserved and extraction completed")).toBeVisible();
    expect(request).toHaveBeenCalledOnce();
  });

  it("does not alter queues, Story states, source counts, or fixtures on submission", async () => {
    const request = controlledSourceRequest();
    const fixturesBefore = JSON.stringify({ queues: NEWSROOM_QUEUES, stories: NEWSROOM_STORIES });
    const queuesBefore = NEWSROOM_QUEUES.map((queue) => ({ ...queue }));
    const storiesBefore = NEWSROOM_STORIES.map((story) => ({
      id: story.id,
      state: story.state,
      sourceCount: story.sourceCount,
    }));
    render(<NewsroomShell requestSourceEvidence={request} />);

    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: SHELL_SOURCE.submittedUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());

    expect(NEWSROOM_QUEUES.map((queue) => ({ ...queue }))).toEqual(queuesBefore);
    expect(
      NEWSROOM_STORIES.map((story) => ({
        id: story.id,
        state: story.state,
        sourceCount: story.sourceCount,
      })),
    ).toEqual(storiesBefore);
    expect(JSON.stringify({ queues: NEWSROOM_QUEUES, stories: NEWSROOM_STORIES })).toBe(
      fixturesBefore,
    );
    expect(screen.getByRole("button", { name: "Create Story from Source" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Assistant" }));
    expect(screen.getByText("Not connected yet")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Agent activity will appear here" })).toBeVisible();
  });

  it("renders authoritative inspection after the real workflow and can return to a fixture", async () => {
    const sourceRequest = controlledSourceRequest();
    const storyRequests = controlledStoryRequests();
    const fixturesBefore = JSON.stringify({ queues: NEWSROOM_QUEUES, stories: NEWSROOM_STORIES });
    render(<NewsroomShell requestSourceEvidence={sourceRequest} storyRequests={storyRequests} />);
    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: SHELL_SOURCE.submittedUrl },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Story title" }), {
      target: { value: PERSISTED_STORY.title },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: PERSISTED_ATTACHMENT.relevance },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    expect(await screen.findByText("Persisted Story")).toBeVisible();
    const heading = screen.getByRole("heading", { name: PERSISTED_STORY.title });
    const workspace = heading.closest("article");
    if (!workspace) throw new Error("Expected the persisted Story heading inside an article.");
    expect(heading).toBeVisible();
    expect(within(workspace).getByText("Intake")).toBeVisible();
    expect(within(workspace).getByText(PERSISTED_ATTACHMENT.relevance)).toBeVisible();
    expect(within(workspace).getByText(`Story ID: ${PERSISTED_STORY.id}`)).toBeVisible();
    expect(within(workspace).getByText(SHELL_SOURCE.id)).toBeVisible();
    expect(within(workspace).getAllByText(`operator: ${SOURCE_ACTOR.operatorId}`)).toHaveLength(2);
    expect(workspace.querySelector(`time[datetime="${PERSISTED_STORY.createdAt}"]`)).toBeVisible();
    expect(workspace.querySelector(`time[datetime="${PERSISTED_STORY.updatedAt}"]`)).toBeVisible();
    expect(workspace.querySelector(`time[datetime="${SHELL_SOURCE.receivedAt}"]`)).toBeVisible();
    expect(
      workspace.querySelector(`time[datetime="${PERSISTED_ATTACHMENT.attachedAt}"]`),
    ).toBeVisible();
    expect(
      within(workspace).getByRole("link", { name: SHELL_SOURCE.canonicalUrl }),
    ).toHaveAttribute("href", SHELL_SOURCE.canonicalUrl);
    expect(screen.getByText(/Assignments are not connected/)).toBeVisible();
    expect(screen.getByText(/Durable Story activity is not connected/)).toBeVisible();
    expect(storyRequests.createStory).toHaveBeenCalledWith(PERSISTED_STORY.title);
    expect(storyRequests.attachSource).toHaveBeenCalledWith(
      PERSISTED_STORY.id,
      SHELL_SOURCE.id,
      PERSISTED_ATTACHMENT.relevance,
    );
    expect(storyRequests.inspectStory).toHaveBeenCalledWith(PERSISTED_STORY.id);
    expect(JSON.stringify({ queues: NEWSROOM_QUEUES, stories: NEWSROOM_STORIES })).toBe(
      fixturesBefore,
    );

    const fixture = NEWSROOM_STORIES[0];
    fireEvent.click(screen.getByRole("button", { name: new RegExp(fixture.title) }));
    expect(screen.getByRole("heading", { name: fixture.title })).toBeVisible();
    expect(screen.queryByText("Persisted Story")).not.toBeInTheDocument();
  });
});
