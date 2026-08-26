import { DragDropProvider } from "@dnd-kit/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import {
  agentProfileId,
  agentRunId,
  operatorId,
  storyId,
  type AgentProfile,
  type AgentRun,
} from "@/domain/editorial";

import { StoryWorkspace } from "./story-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const STORY = {
  id: storyId("story-duplication-95"),
  title: "A Story with a run in flight",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} as const;

const WRITER = {
  id: agentProfileId("writer-duplication-95"),
  role: "writer",
  name: "Writer",
  instructions: "Write.",
  model: null,
  builtIn: true,
} satisfies AgentProfile;

const RUN_ID = agentRunId("run-duplication-95");

const RESEARCH_RUN = {
  id: agentRunId("run-research-95"),
  storyId: STORY.id,
  profileId: agentProfileId("storyrail-researcher-v1"),
  role: "researcher",
  operation: "source_research",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_researcher", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-duplication-95") },
  startedAt: "started",
  completedAt: null,
  input: { story: { id: STORY.id, title: STORY.title, state: "intake", revisionCycle: 0 } },
  outcome: "running",
} as unknown as AgentRun;

const RUN = {
  id: RUN_ID,
  storyId: STORY.id,
  profileId: agentProfileId("storyrail-assignment-editor-v1"),
  role: "assignment_editor",
  operation: "assignment_proposal",
  model: { provider: "openrouter", model: "provider/model" },
  prompt: { key: "storyrail_assignment_editor", version: "1" },
  requestedBy: { type: "operator", operatorId: operatorId("operator-duplication-95") },
  startedAt: "started",
  completedAt: "completed",
  input: {
    story: { id: STORY.id, title: STORY.title, state: "intake", revisionCycle: 0 },
    evidence: [],
    unavailableSourceIds: [],
    writerProfileIds: [WRITER.id],
  },
  outcome: "failed",
  failure: { code: "MODEL_OUTPUT_INVALID", retryable: true },
} as unknown as AgentRun;

function inspection(agentRuns: readonly AgentRun[] = []): StoryInspection {
  return {
    story: STORY,
    sources: [],
    assignment: null,
    transitions: [],
    agentRuns,
    reviewDecisions: [],
    deliveries: [],
    toolCalls: [],
    article: null,
  } as unknown as StoryInspection;
}

const unavailable = async () =>
  ({ kind: "unavailable", message: STORY_REQUEST_UNAVAILABLE_MESSAGE }) as const;

function requests(overrides: Partial<StoryClient>): StoryClient {
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
    ...overrides,
  } as StoryClient;
}

describe("a Story whose run is reported twice", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records a run once when the poll saw it before the request resolved", async () => {
    let settle: (() => void) | null = null;
    const generateAssignmentProposal = vi.fn<StoryClient["generateAssignmentProposal"]>(
      () =>
        new Promise((resolve) => {
          settle = () => resolve({ kind: "completed", value: RUN });
        }),
    );
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: inspection([RESEARCH_RUN, RUN]),
    }));

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={inspection([RESEARCH_RUN])}
          requests={requests({ generateAssignmentProposal, inspectStory })}
          staff={{ kind: "loaded", profiles: [WRITER] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Draw up the Assignment" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    await act(async () => {
      settle?.();
      await Promise.resolve();
    });

    expect(screen.getAllByText(RUN_ID)).toHaveLength(1);
  });
});
