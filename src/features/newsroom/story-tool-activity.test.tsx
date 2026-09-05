import { DragDropProvider } from "@dnd-kit/react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StoryInspection } from "@/application/story-inspection";
import type { AgentToolCall } from "@/domain/editorial";

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
    resolveLegacyDeliveryMapping: vi.fn(unavailable),
  } as unknown as StoryClient;
}

const RESEARCH_RUN = {
  id: "run-research",
  storyId: "story-activity",
  profileId: "profile-researcher",
  role: "researcher",
  operation: "source_research",
  model: { provider: "openrouter", model: "a-model" },
  prompt: { key: "storyrail_source_research", version: "1" },
  requestedBy: { type: "operator", operatorId: "operator-activity" },
  startedAt: "2026-08-26T14:54:48.000Z",
  completedAt: null,
  outcome: "running",
} as const;

function call(overrides: Partial<Record<string, unknown>>): AgentToolCall {
  return {
    id: "call",
    runId: RESEARCH_RUN.id,
    storyId: "story-activity",
    sequence: 1,
    tool: "web_search",
    request: { query: "Mac Studio M5" },
    requestedAt: "2026-08-26T14:54:49.000Z",
    outcome: "succeeded",
    completedAt: "2026-08-26T14:54:52.000Z",
    result: {},
    ...overrides,
  } as unknown as AgentToolCall;
}

const CALLS: readonly AgentToolCall[] = [
  call({ id: "call-1", sequence: 1, tool: "search_archive", request: { query: "Mac Studio M5" } }),
  call({
    id: "call-2",
    sequence: 2,
    tool: "fetch_url",
    request: { url: "https://www.apple.com/mac-studio/" },
  }),
  call({
    id: "call-3",
    sequence: 3,
    tool: "fetch_url",
    request: { url: "https://www.theverge.com/mac-studio-m5-max-ultra-price" },
    outcome: "failed",
    completedAt: "2026-08-26T14:55:10.000Z",
    failure: {
      code: "TOOL_TARGET_REFUSED",
      retryable: false,
      message: "theverge.com answered 403.",
    },
  }),
];

function inspection(toolCalls: readonly AgentToolCall[]): StoryInspection {
  return {
    story: {
      id: "story-activity",
      title: "A researched Story",
      state: "intake",
      revisionCycle: 0,
      createdAt: "created",
      updatedAt: "updated",
    },
    sources: [],
    assignment: null,
    transitions: [],
    agentRuns: [RESEARCH_RUN],
    reviewDecisions: [],
    deliveries: [],
    toolCalls,
    article: null,
  } as unknown as StoryInspection;
}

function renderWorkspace(value: StoryInspection) {
  render(
    <DragDropProvider>
      <StoryWorkspace
        inspection={value}
        requests={requests()}
        staff={{ kind: "loaded", profiles: [] }}
        onAssigned={vi.fn()}
        onWriterCompleted={vi.fn()}
        onReviewStateChanged={vi.fn()}
      />
    </DragDropProvider>,
  );
}

describe("a run narrating what it reached for", () => {
  it("lists every tool call with its tool, its argument and its outcome, in the order made", () => {
    renderWorkspace(inspection(CALLS));

    const listed = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    const activity = listed.filter(
      (text) => text.includes("Searched") || text.includes("Retrieved"),
    );
    expect(activity).toHaveLength(3);
    expect(activity[0]).toContain("Searched the archive");
    expect(activity[0]).toContain("Mac Studio M5");
    expect(activity[0]).toContain("Succeeded");
    expect(activity[1]).toContain("Retrieved a page");
    expect(activity[1]).toContain("apple.com/mac-studio/");
    expect(activity[2]).toContain("theverge.com/mac-studio-m5-max-ultra-price");
    expect(activity[2]).toContain("Failed");
  });

  // A refused fetch was invisible: the operator saw one attached Source and had no way to learn
  // that a site had declined to be read.
  it("says in prose why a refused call was refused, alongside its durable code", () => {
    renderWorkspace(inspection(CALLS));

    expect(screen.getByText(/The target refused to be read/)).toBeTruthy();
    expect(screen.getByText(/theverge\.com answered 403\./)).toBeTruthy();
    expect(screen.getByText(/\(TOOL_TARGET_REFUSED\)/)).toBeTruthy();
  });

  it("says how many of the run's allowed calls were spent", () => {
    renderWorkspace(inspection(CALLS));

    expect(screen.getByText(/3 of 12 research calls used/)).toBeTruthy();
    expect(screen.getByText(/1 call was refused/)).toBeTruthy();
  });

  it("names the time a call was made in a form a person reads", () => {
    renderWorkspace(inspection([CALLS[0] as AgentToolCall]));

    expect(screen.getByText(/26 Aug 2026, 14:54:49 UTC/)).toBeTruthy();
    expect(screen.queryByText(/2026-08-26T14:54:49\.000Z/)).toBeNull();
  });

  it("shows nothing at all for a Story whose runs reached for nothing", () => {
    renderWorkspace(inspection([]));

    expect(screen.queryByText(/What the newsroom reached for/)).toBeNull();
  });
});
