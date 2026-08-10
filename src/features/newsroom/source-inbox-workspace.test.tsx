import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  operatorId,
  sourceExtractionId,
  sourceId,
  storyId,
  type CanonicalSourceUrl,
  type SourceExtraction,
  type Story,
  type StorySourceAttachment,
  type UrlSource,
} from "@/domain/editorial";

import type { SourceInboxClient } from "./source-inbox-client";
import { SourceInboxWorkspace, type SourceInboxWorkspaceProps } from "./source-inbox-workspace";
import type { StoryClient } from "./story-client";

const actor = { type: "operator", operatorId: operatorId("operator-24") } as const;
const source = {
  id: sourceId("source-24"),
  type: "url",
  submittedUrl: "https://example.com/report?submitted=true",
  canonicalUrl: "https://example.com/report" as CanonicalSourceUrl,
  submittedBy: actor,
  receivedAt: "received-time",
} satisfies UrlSource;
const extraction = {
  id: sourceExtractionId("extraction-24"),
  sourceId: source.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: actor,
  startedAt: "start",
  completedAt: "complete",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Persisted evidence",
    title: "Extracted title",
    byline: null,
    publishedAt: null,
    language: null,
  },
} satisfies SourceExtraction;
const item = { source, extractions: [extraction] } as const;
const story = {
  id: storyId("story-24"),
  title: "Existing Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} satisfies Story;
const attachment = {
  storyId: story.id,
  sourceId: source.id,
  relevance: "Relevant",
  attachedBy: actor,
  attachedAt: "attached",
} satisfies StorySourceAttachment;

function clients() {
  const inbox: SourceInboxClient = {
    listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
      kind: "completed",
      value: [item],
    })),
    recordTriageDecision: vi.fn<SourceInboxClient["recordTriageDecision"]>(
      async (_sourceId, decision, storyId, reason) => ({
        kind: "completed",
        value: {
          sourceId: source.id,
          decision,
          storyId: storyId === null ? null : (storyId as Story["id"]),
          reason,
          decidedBy: actor,
          decidedAt: "decided",
        },
      }),
    ),
  };
  const stories: StoryClient = {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: story,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "completed",
      value: attachment,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: { story, sources: [{ attachment, source, extractions: [extraction] }] },
    })),
  };
  return { inbox, stories };
}

function renderInbox(
  inbox: SourceInboxClient,
  stories: StoryClient,
  options: {
    readonly sourceCount?: number;
    readonly onStoryKnown?: SourceInboxWorkspaceProps["onStoryKnown"];
  } = {},
) {
  return render(
    <SourceInboxWorkspace
      refreshVersion={0}
      stories={[{ story, sourceCount: options.sourceCount ?? 0 }]}
      inboxRequests={inbox}
      storyRequests={stories}
      onStoryKnown={options.onStoryKnown ?? vi.fn()}
      onStoryLoaded={vi.fn()}
    />,
  );
}

describe("SourceInboxWorkspace", () => {
  it("does not show an empty state before loading and renders all three choices with persisted Markdown", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    expect(screen.getByText("Loading pending Sources…")).toBeVisible();
    expect(await screen.findByText("# Persisted evidence")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create new Story" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Attach to existing Story" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Skip" })).toBeVisible();
  });

  it("runs create, attach, triage, inspect in order and only then removes the Source", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    fireEvent.click(await screen.findByRole("button", { name: "Create new Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), { target: { value: "Relevant" } });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "New subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create, attach, and record decision" }));
    await waitFor(() => expect(stories.inspectStory).toHaveBeenCalledWith(story.id));
    expect(stories.createStory).toHaveBeenCalledWith("Extracted title");
    expect(stories.attachSource).toHaveBeenCalledWith(story.id, source.id, "Relevant");
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "new_story",
      story.id,
      "New subject",
    );
    expect(screen.queryByText("# Persisted evidence")).not.toBeInTheDocument();
  });

  it("attaches to an existing Story without creating another Story", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    fireEvent.click(await screen.findByRole("button", { name: "Attach to existing Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), {
      target: { value: "Additional facts" },
    });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "Same subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach and record decision" }));
    await waitFor(() => expect(inbox.recordTriageDecision).toHaveBeenCalled());
    expect(stories.createStory).not.toHaveBeenCalled();
    expect(stories.attachSource).toHaveBeenCalledWith(story.id, source.id, "Additional facts");
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "existing_story",
      story.id,
      "Same subject",
    );
  });

  it("records skip without mutating Stories", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "No material facts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record skip decision" }));
    await waitFor(() =>
      expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
        source.id,
        "skip",
        null,
        "No material facts",
      ),
    );
    expect(stories.createStory).not.toHaveBeenCalled();
    expect(stories.attachSource).not.toHaveBeenCalled();
    expect(stories.inspectStory).not.toHaveBeenCalled();
  });

  it("preserves a known count of one when new Story inspection fails", async () => {
    const { inbox, stories } = clients();
    const failedStories: StoryClient = {
      ...stories,
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: "The Story request could not be completed.",
      })),
    };
    const onStoryKnown = vi.fn<SourceInboxWorkspaceProps["onStoryKnown"]>();
    renderInbox(inbox, failedStories, { onStoryKnown });

    fireEvent.click(await screen.findByRole("button", { name: "Create new Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), { target: { value: "Relevant" } });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "New subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create, attach, and record decision" }));

    expect(
      await screen.findByText(/authoritative Story inspection could not be loaded/i),
    ).toBeVisible();
    expect(onStoryKnown).toHaveBeenLastCalledWith(story, 1);
  });

  it("preserves N plus one when existing Story inspection fails", async () => {
    const { inbox, stories } = clients();
    const failedStories: StoryClient = {
      ...stories,
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: "The Story request could not be completed.",
      })),
    };
    const onStoryKnown = vi.fn<SourceInboxWorkspaceProps["onStoryKnown"]>();
    renderInbox(inbox, failedStories, { sourceCount: 4, onStoryKnown });

    fireEvent.click(await screen.findByRole("button", { name: "Attach to existing Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), {
      target: { value: "Additional facts" },
    });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "Same subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach and record decision" }));

    expect(
      await screen.findByText(/authoritative Story inspection could not be loaded/i),
    ).toBeVisible();
    expect(onStoryKnown).toHaveBeenLastCalledWith(story, 5);
  });
});
