import { DragDropProvider } from "@dnd-kit/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoryInspection } from "@/application/story-inspection";
import type { StoryClient } from "./story-client";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE } from "./story-client";
import { StoryWorkspace } from "./story-workspace";

const unavailable = async () =>
  ({
    kind: "unavailable" as const,
    message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
  }) as const;
const requests: StoryClient = {
  listStories: vi.fn(unavailable),
  createStory: vi.fn(unavailable),
  attachSource: vi.fn(unavailable),
  inspectStory: vi.fn(unavailable),
  assignStory: vi.fn(unavailable),
  generateAssignmentProposal: vi.fn(unavailable),
  createWriterDraft: vi.fn(unavailable),
  submitReview: vi.fn(unavailable),
  runDirectorReview: vi.fn(unavailable),
  recordReviewDecision: vi.fn(unavailable),
};

function inspection(): StoryInspection {
  const story = {
    id: "story-38",
    title: "Reviewed Story",
    state: "in_review",
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "review",
  } as const;
  const assignment = {
    id: "assignment-38",
    storyId: story.id,
    writerProfileId: "writer-38",
    sourceIds: ["source-38"],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: { type: "operator", operatorId: "operator-38" },
    assignedAt: "assigned",
  } as const;
  const revision = {
    id: "revision-38",
    articleId: "article-38",
    revisionNumber: 1,
    writerProfileId: "writer-38",
    agentRunId: "writer-run-38",
    headline: "Article headline",
    dek: null,
    bodyMarkdown: "Article body.",
    createdBy: { type: "agent", role: "writer", runId: "writer-run-38" },
    createdAt: "drafted",
  } as const;
  return {
    story,
    sources: [],
    assignment: {
      assignment,
      writerProfile: {
        id: "writer-38",
        role: "writer",
        name: "Writer",
        instructions: "Write.",
        model: null,
        builtIn: true,
      },
    },
    transitions: [],
    reviewDecisions: [],
    article: {
      article: {
        id: "article-38",
        storyId: story.id,
        assignmentId: assignment.id,
        createdAt: "drafted",
      },
      revisions: [revision],
    },
    agentRuns: [
      {
        id: "director-run-38",
        storyId: story.id,
        profileId: "storyrail-director-v1",
        role: "editor_in_chief",
        operation: "article_review",
        model: { provider: "openrouter", model: "director-model" },
        prompt: { key: "storyrail_director_review", version: "1" },
        requestedBy: { type: "operator", operatorId: "operator-38" },
        startedAt: "start",
        completedAt: "end",
        input: {
          story: { id: story.id, title: story.title, state: story.state, revisionCycle: 0 },
          assignment: {
            id: assignment.id,
            storyId: story.id,
            writerProfileId: "writer-38",
            sourceIds: ["source-38"],
            angle: "Angle",
            brief: "Brief",
            constraints: null,
          },
          article: { id: "article-38", assignmentId: assignment.id },
          revision: {
            id: revision.id,
            articleId: revision.articleId,
            revisionNumber: 1,
            writerProfileId: "writer-38",
            agentRunId: "writer-run-38",
            headline: revision.headline,
            dek: null,
            bodyMarkdown: revision.bodyMarkdown,
          },
          evidence: [
            {
              sourceId: "source-38",
              relevance: "Primary",
              evidenceKind: "prepared",
              evidenceId: "preparation-38",
            },
          ],
          unavailableSourceIds: [],
        },
        outcome: "succeeded",
        review: {
          recommendation: "request_changes",
          summary: "One factual claim needs support.",
          checks: {
            assignment: { status: "pass", note: "Aligned." },
            accuracy: { status: "needs_changes", note: "Support the timeline." },
            headline: { status: "pass", note: "Supported." },
            structure: { status: "pass", note: "Coherent." },
            style: { status: "pass", note: "Clear." },
          },
          revisionInstructions: "Support the timeline or remove the claim.",
        },
      },
    ] as unknown as StoryInspection["agentRuns"],
  } as unknown as StoryInspection;
}

describe("Director review workspace", () => {
  it("shows text review checks and explicit editable operator decision controls", () => {
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={inspection()}
          requests={requests}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );
    expect(screen.getByRole("heading", { name: "Request changes" })).toBeVisible();
    expect(screen.getAllByText("PASS")).toHaveLength(4);
    expect(screen.getByText("NEEDS CHANGES")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
    const requestChanges = screen.getByRole("button", { name: "Request changes" });
    expect(requestChanges).toBeVisible();
    expect(screen.getByLabelText("Reason")).toHaveValue("");
    fireEvent.click(requestChanges);
    expect(screen.getByLabelText("Reason")).toHaveValue(
      "Support the timeline or remove the claim.",
    );
    expect(screen.getByRole("button", { name: "Record decision" })).toBeVisible();
  });
});
