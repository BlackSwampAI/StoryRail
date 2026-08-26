import { DragDropProvider } from "@dnd-kit/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

import type { StoryInspection } from "@/application/story-inspection";
import {
  agentProfileId,
  agentRunId,
  operatorId,
  storyId,
  type AgentRun,
  type StoryState,
} from "@/domain/editorial";

import { StoryWorkspace } from "./story-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const STORY_ID = storyId("story-rail-advance-104");

function run(id: string, role: string, operation: string, outcome: "running" | "succeeded") {
  return {
    id: agentRunId(id),
    storyId: STORY_ID,
    profileId: agentProfileId(`profile-${id}`),
    role,
    operation,
    model: { provider: "openrouter", model: "provider/model" },
    prompt: { key: `storyrail_${role}`, version: "1" },
    requestedBy: { type: "operator", operatorId: operatorId("operator-rail-advance") },
    startedAt: "started",
    completedAt: outcome === "running" ? null : "completed",
    input: {
      story: { id: STORY_ID, title: "A Story", state: "intake", revisionCycle: 0 },
      assignment: { id: `assignment-${id}` },
      evidence: [],
      unavailableSourceIds: [],
    },
    outcome,
  } as unknown as AgentRun;
}

const RESEARCH_RUN = run("run-research-104", "researcher", "source_research", "running");
const WRITER_RUN = run("run-writer-104", "writer", "article_draft", "running");

function inspection(state: StoryState, agentRuns: readonly AgentRun[]): StoryInspection {
  return {
    story: {
      id: STORY_ID,
      title: "A Story travelling under autopilot",
      state,
      revisionCycle: 0,
      createdAt: "created",
      updatedAt: "updated",
    },
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

/**
 * The newsroom shell owns the Story and hands it back down, so the rail can only move if the
 * workspace passes a refreshed inspection up. This stands in for that owner.
 */
function Newsroom({
  initial,
  client,
}: {
  readonly initial: StoryInspection;
  readonly client: StoryClient;
}) {
  const [current, setCurrent] = useState(initial);
  return (
    <DragDropProvider>
      <StoryWorkspace
        inspection={current}
        requests={client}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={setCurrent}
        onReviewStateChanged={setCurrent}
      />
    </DragDropProvider>
  );
}

function currentStop(): string {
  const stop = document.querySelector('#story-rail li[aria-current="step"]');
  return stop?.textContent ?? "";
}

describe("the rail while the newsroom works on a Story", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("moves to the stop the Story reached while a run was still in flight", async () => {
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: inspection("assigned", [RESEARCH_RUN, WRITER_RUN]),
    }));

    render(
      <Newsroom
        initial={inspection("intake", [RESEARCH_RUN])}
        client={requests({ inspectStory })}
      />,
    );
    expect(currentStop()).toContain("Intake");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(currentStop()).toContain("Assigned");
  });

  it("moves to the stop autopilot reached without the operator touching the screen", async () => {
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: inspection("in_progress", [WRITER_RUN]),
    }));
    const startAutopilot = vi.fn<StoryClient["startAutopilot"]>(async () => ({
      kind: "completed",
      value: { runId: "autopilot-run-104" },
    }));

    render(
      <Newsroom
        initial={inspection("intake", [])}
        client={requests({ inspectStory, startAutopilot })}
      />,
    );
    expect(currentStop()).toContain("Intake");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Run this Story to publication" }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(currentStop()).toContain("Drafting");
  });
});
