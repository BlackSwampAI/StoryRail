import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { operatorId, sourceExtractionId, sourceId, storyId, type Story } from "@/domain/editorial";

import type { SourceInboxClient } from "./source-inbox-client";
import { SourceInboxWorkspace } from "./source-inbox-workspace";
import type { StoryClient } from "./story-client";

const actor = { type: "operator", operatorId: operatorId("operator-recovery") } as const;
const source = {
  id: sourceId("source-recovery"),
  type: "url",
  submittedUrl: "https://example.com/source",
  canonicalUrl: "https://example.com/source",
  submittedBy: actor,
  receivedAt: "received",
} as const;
const extraction = {
  id: sourceExtractionId("extraction-recovery"),
  sourceId: source.id,
  extractor: { key: "test", version: "1" },
  requestedBy: actor,
  startedAt: "started",
  completedAt: "completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "Evidence",
    title: "Service change",
    byline: null,
    publishedAt: null,
    language: null,
  },
} as const;
const pending = { source, extractions: [extraction], preparations: [] };
const story = {
  id: storyId("story-recovery"),
  title: "Service change",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} satisfies Story;

function setup(options: {
  initialAttachmentCommitted: boolean;
  firstInspectionUnavailable?: boolean;
}) {
  let inspectionCount = 0;
  let storedAttachment: {
    storyId: Story["id"];
    sourceId: typeof source.id;
    relevance: string;
  } | null = null;
  const inbox = {
    listPendingSources: vi.fn(async () => ({ kind: "completed" as const, value: [pending] })),
    recordTriageDecision: vi.fn(
      async (
        _sourceId: typeof source.id,
        decision: string,
        target: Story["id"] | null,
        reason: string,
      ) => ({
        kind: "completed" as const,
        value: {
          sourceId: _sourceId,
          decision,
          storyId: target,
          reason,
          decidedBy: actor,
          decidedAt: "decided",
        },
      }),
    ),
  } as unknown as SourceInboxClient;
  const attachSource = vi.fn(
    async (targetStoryId: Story["id"], targetSourceId: typeof source.id, relevance: string) => {
      if (attachSource.mock.calls.length === 1) {
        if (options.initialAttachmentCommitted)
          storedAttachment = { storyId: targetStoryId, sourceId: targetSourceId, relevance };
        return {
          kind: "unavailable" as const,
          message: "The Story request could not be completed.",
        };
      }
      storedAttachment = { storyId: targetStoryId, sourceId: targetSourceId, relevance };
      return {
        kind: "completed" as const,
        value: { ...storedAttachment, attachedBy: actor, attachedAt: "attached" },
      };
    },
  );
  const stories = {
    createStory: vi.fn(async () => ({ kind: "completed" as const, value: story })),
    attachSource,
    inspectStory: vi.fn(async () => {
      inspectionCount += 1;
      if (options.firstInspectionUnavailable && inspectionCount === 1)
        return {
          kind: "unavailable" as const,
          message: "The Story request could not be completed.",
        };
      const attachments = storedAttachment
        ? [
            {
              attachment: { ...storedAttachment, attachedBy: actor, attachedAt: "attached" },
              source,
              extractions: [extraction],
              preparations: [],
            },
          ]
        : [];
      return {
        kind: "completed" as const,
        value: {
          story,
          sources: attachments,
          assignment: null,
          transitions: [],
          agentRuns: [],
          reviewDecisions: [],
          deliveries: [],
          toolCalls: [],
          article: null,
        },
      };
    }),
  } as unknown as StoryClient;
  render(
    <SourceInboxWorkspace
      refreshVersion={0}
      stories={[]}
      inboxRequests={inbox}
      storyRequests={stories}
      onStoryKnown={vi.fn()}
      onStoryLoaded={vi.fn()}
    />,
  );
  return { inbox, stories, attachSource };
}

async function beginCover() {
  fireEvent.click(await screen.findByRole("button", { name: "Cover this" }));
  fireEvent.click(screen.getByRole("button", { name: "Cover this Source" }));
  expect(
    await screen.findByText(/Story exists; Source attachment outcome is unavailable/i),
  ).toBeVisible();
}

describe("Source Inbox Cover attachment recovery", () => {
  it("checks status before retrying and uses the original attachment and triage wording", async () => {
    const { inbox, stories, attachSource } = setup({
      initialAttachmentCommitted: true,
      firstInspectionUnavailable: true,
    });
    await beginCover();
    fireEvent.change(screen.getByLabelText("Why does this matter to your readers?"), {
      target: { value: "An edited answer after the Story was created." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Check and continue attachment" }));
    expect(
      await screen.findByText(
        "The attachment status could not be checked. Check again before retrying.",
      ),
    ).toBeVisible();
    expect(attachSource).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Check and continue attachment" }));
    await waitFor(() => expect(inbox.recordTriageDecision).toHaveBeenCalledOnce());
    expect(attachSource).toHaveBeenCalledOnce();
    expect(stories.createStory).toHaveBeenCalledOnce();
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "new_story",
      story.id,
      "Covered this Source to investigate: Investigate what this source means for our readers",
    );
  });

  it("reattaches only after inspection confirms absence and never recreates the Story", async () => {
    const { inbox, stories, attachSource } = setup({ initialAttachmentCommitted: false });
    await beginCover();
    fireEvent.click(screen.getByRole("button", { name: "Check and continue attachment" }));

    await waitFor(() => expect(inbox.recordTriageDecision).toHaveBeenCalledOnce());
    expect(stories.inspectStory).toHaveBeenCalledTimes(2);
    expect(attachSource).toHaveBeenCalledTimes(2);
    expect(attachSource.mock.calls[1]).toEqual(attachSource.mock.calls[0]);
    expect(stories.createStory).toHaveBeenCalledOnce();
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "new_story",
      story.id,
      "Covered this Source to investigate: Investigate what this source means for our readers",
    );
    expect(await screen.findByText("Story created and Source attached.")).toBeVisible();
  });
});
