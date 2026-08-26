import { DragDropProvider } from "@dnd-kit/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";

import { STORY_REQUEST_UNAVAILABLE_MESSAGE } from "./story-client";
import type { StoryClient } from "./story-client";
import { StoryWorkspace } from "./story-workspace";

const unavailable = async () =>
  ({ kind: "unavailable" as const, message: STORY_REQUEST_UNAVAILABLE_MESSAGE }) as const;

const requests: StoryClient = {
  listStories: vi.fn(unavailable),
  createStory: vi.fn(unavailable),
  attachSource: vi.fn(unavailable),
  inspectStory: vi.fn(unavailable),
  assignStory: vi.fn(unavailable),
  startAutopilot: vi.fn(unavailable),
  startSourceResearch: vi.fn(unavailable),
  generateAssignmentProposal: vi.fn(unavailable),
  createWriterDraft: vi.fn(unavailable),
  createWriterRevision: vi.fn(unavailable),
  rejectStory: vi.fn(unavailable),
  publishStory: vi.fn(unavailable),
  submitReview: vi.fn(unavailable),
  runDirectorReview: vi.fn(unavailable),
  recordReviewDecision: vi.fn(unavailable),
  deliverStory: vi.fn(unavailable),
};

const WRITTEN_STATES = [
  "in_progress",
  "in_review",
  "changes_requested",
  "approved",
  "published",
] as const;

function inspection(state: StoryInspection["story"]["state"], written: boolean): StoryInspection {
  const story = {
    id: "story-96",
    title: "A Story to read",
    state,
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "updated",
  } as const;
  const assignment = {
    id: "assignment-96",
    storyId: story.id,
    writerProfileId: "writer-96",
    sourceIds: ["source-96"],
    angle: "Angle",
    brief: "Brief",
    constraints: null,
    assignedBy: { type: "operator", operatorId: "operator-96" },
    assignedAt: "assigned",
  } as const;
  return {
    story,
    sources: [],
    assignment: {
      assignment,
      writerProfile: {
        id: "writer-96",
        role: "writer",
        name: "Writer",
        instructions: "Write.",
        model: null,
        builtIn: true,
      },
    },
    transitions: [],
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    agentRuns: [],
    article: written
      ? {
          article: {
            id: "article-96",
            storyId: story.id,
            assignmentId: assignment.id,
            createdAt: "drafted",
          },
          revisions: [
            {
              id: "revision-96",
              articleId: "article-96",
              revisionNumber: 1,
              writerProfileId: "writer-96",
              agentRunId: "writer-run-96",
              headline: "A Story to read",
              dek: null,
              blocks: [{ kind: "context", markdown: "Article body.", citations: [] }],
              createdBy: { type: "agent", role: "writer", runId: "writer-run-96" },
              createdAt: "drafted",
            },
          ],
        }
      : null,
  } as unknown as StoryInspection;
}

function renderWorkspace(state: StoryInspection["story"]["state"], written: boolean) {
  render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={inspection(state, written)}
        requests={requests}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("reading a Story as prose", () => {
  it.each(WRITTEN_STATES)("offers the plain view once a Revision exists, in %s", (state) => {
    renderWorkspace(state, true);
    expect(screen.getByRole("group", { name: "Article view" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plain text" })).toBeInTheDocument();
  });

  it("offers no plain view before a Writer has produced anything to read", () => {
    renderWorkspace("assigned", false);
    expect(screen.queryByRole("group", { name: "Article view" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plain text" })).not.toBeInTheDocument();
  });
});
