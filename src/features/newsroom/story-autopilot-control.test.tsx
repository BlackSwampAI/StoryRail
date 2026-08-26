import { DragDropProvider } from "@dnd-kit/react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";

import { StoryWorkspace } from "./story-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const unavailable = async () =>
  ({ kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE }) as const;

function requests(): StoryClient {
  return {
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
  } as unknown as StoryClient;
}

const INSPECTION = {
  story: {
    id: "story-autopilot",
    title: "A Story awaiting assignment",
    state: "intake",
    revisionCycle: 0,
    createdAt: "created",
    updatedAt: "updated",
  },
  sources: [],
  assignment: null,
  transitions: [],
  agentRuns: [],
  reviewDecisions: [],
  deliveries: [],
  toolCalls: [],
  article: null,
} as unknown as StoryInspection;

function renderWorkspace() {
  render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={INSPECTION}
        requests={requests()}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("the research option on autopilot", () => {
  // Loose on the page it read as "research this Story". An operator ticked it, stepped the Story
  // by hand, and research was never asked to run — the option is consumed by autopilot alone.
  it("sits inside the autopilot control, beside the button that consumes it", () => {
    renderWorkspace();

    const control = screen.getByRole("group", { name: "Autopilot" });
    expect(
      within(control).getByRole("checkbox", { name: /Research first, when autopilot runs/ }),
    ).toBeTruthy();
    expect(within(control).getByRole("button", { name: "Run autopilot" })).toBeTruthy();
  });

  it("says where to research a Story now, so the option is not mistaken for that action", () => {
    renderWorkspace();

    expect(screen.getByText(/It applies only to autopilot/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find more Sources" })).toBeTruthy();
  });
});
