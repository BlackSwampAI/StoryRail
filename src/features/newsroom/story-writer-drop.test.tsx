import { DragDropProvider } from "@dnd-kit/react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import {
  agentProfileId,
  agentRunId,
  operatorId,
  storyId,
  type AgentProfile,
} from "@/domain/editorial";

import { WRITER_ASSIGNMENT_DROP_ID, type StaffState } from "./newsroom-staff";
import {
  isWriterDropEligible,
  resolveWriterDropSelection,
  StoryWorkspace,
} from "./story-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const FIRST_WRITER = {
  id: agentProfileId("writer-first-33"),
  role: "writer",
  name: "First Writer",
  instructions: "Write first.",
  model: null,
  builtIn: true,
} satisfies AgentProfile;

const SECOND_WRITER = {
  id: agentProfileId("writer-second-33"),
  role: "writer",
  name: "Second Writer",
  instructions: "Write second.",
  model: { provider: "openrouter", model: "second/model" },
  builtIn: false,
} satisfies AgentProfile;

const STAFF = {
  kind: "loaded",
  profiles: [FIRST_WRITER, SECOND_WRITER],
} satisfies StaffState;

const STORY = {
  id: storyId("story-writer-drop-33"),
  title: "Interactive Desk Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} as const;

function inspection(agentRuns: StoryInspection["agentRuns"] = []): StoryInspection {
  return {
    story: STORY,
    sources: [],
    assignment: null,
    transitions: [],
    agentRuns,
    reviewDecisions: [],
    article: null,
  };
}

function requests(): StoryClient {
  return {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: STORY,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: inspection(),
    })),
    assignStory: vi.fn<StoryClient["assignStory"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    startAutopilot: vi.fn<StoryClient["startAutopilot"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    generateAssignmentProposal: vi.fn<StoryClient["generateAssignmentProposal"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    createWriterDraft: vi.fn<StoryClient["createWriterDraft"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    createWriterRevision: vi.fn<StoryClient["createWriterRevision"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    rejectStory: vi.fn<StoryClient["rejectStory"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    publishStory: vi.fn<StoryClient["publishStory"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    submitReview: vi.fn<StoryClient["submitReview"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    runDirectorReview: vi.fn<StoryClient["runDirectorReview"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
    recordReviewDecision: vi.fn<StoryClient["recordReviewDecision"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    })),
  };
}

function renderWorkspace(storyInspection: StoryInspection, storyRequests: StoryClient) {
  return render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={storyInspection}
        requests={storyRequests}
        staff={STAFF}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("Writer Assignment drops", () => {
  it("exposes the drop target only for Intake without a durable Assignment", () => {
    const intake = inspection();
    expect(isWriterDropEligible(intake)).toBe(true);
    expect(isWriterDropEligible({ story: { ...STORY, state: "assigned" }, assignment: null })).toBe(
      false,
    );
    expect(
      isWriterDropEligible({ story: { ...STORY, state: "in_progress" }, assignment: null }),
    ).toBe(false);
    expect(isWriterDropEligible({ story: STORY, assignment: {} as never })).toBe(false);
  });

  it("turns a fresh Writer drop into a local editing selection without creating an Assignment", () => {
    const storyRequests = requests();
    const selection = resolveWriterDropSelection({
      canceled: false,
      targetId: WRITER_ASSIGNMENT_DROP_ID,
      profile: SECOND_WRITER,
      eligible: true,
    });

    expect(selection).toEqual({ profile: SECOND_WRITER, recommendationChanged: false });
    expect(storyRequests.assignStory).not.toHaveBeenCalled();
  });

  it("changes only the local Writer when overriding a durable proposal", async () => {
    const proposal = {
      id: agentRunId("assignment-proposal-33"),
      storyId: STORY.id,
      profileId: agentProfileId("storyrail-assignment-editor-v1"),
      role: "assignment_editor",
      operation: "assignment_proposal",
      model: { provider: "openrouter", model: "editor/model" },
      prompt: { key: "storyrail_assignment_editor", version: "1" },
      requestedBy: { type: "operator", operatorId: operatorId("operator-33") },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: {
          id: STORY.id,
          title: STORY.title,
          state: "intake",
          revisionCycle: 0,
        },
        evidence: [],
        unavailableSourceIds: [],
        writerProfileIds: [FIRST_WRITER.id, SECOND_WRITER.id],
      },
      outcome: "succeeded",
      proposal: {
        writerProfileId: FIRST_WRITER.id,
        angle: "Keep this angle",
        brief: "Keep this brief",
        constraints: "Keep this constraint",
        reason: "Keep this reason",
      },
    } as const;
    const proposedInspection = inspection([proposal]);
    const storyRequests = requests();
    renderWorkspace(proposedInspection, storyRequests);

    expect(screen.getByRole("heading", { name: "First Writer" })).toBeVisible();
    expect(
      resolveWriterDropSelection({
        canceled: false,
        targetId: WRITER_ASSIGNMENT_DROP_ID,
        profile: SECOND_WRITER,
        eligible: true,
        proposalWriterProfileId: FIRST_WRITER.id,
      }),
    ).toEqual({ profile: SECOND_WRITER, recommendationChanged: true });
    fireEvent.click(screen.getByRole("button", { name: "Edit before assigning" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Writer" }), {
      target: { value: SECOND_WRITER.id },
    });

    expect(await screen.findByRole("combobox", { name: "Writer" })).toHaveValue(SECOND_WRITER.id);
    expect(screen.getByDisplayValue("Keep this angle")).toBeVisible();
    expect(screen.getByDisplayValue("Keep this brief")).toBeVisible();
    expect(screen.getByDisplayValue("Keep this constraint")).toBeVisible();
    expect(screen.getByDisplayValue("Keep this reason")).toBeVisible();
    expect(screen.getByText(/Writer recommendation changed locally/)).toBeVisible();
    expect(storyRequests.assignStory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("History & Audit"));
    expect(screen.getByText("assignment-proposal-33")).toBeVisible();
  });
});
