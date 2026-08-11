import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  assignmentId,
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  transitionId,
  type Story,
} from "@/domain/editorial";

import { NewsroomShell } from "./newsroom-shell";
import type { SourceInboxClient } from "./source-inbox-client";
import type { StoryClient } from "./story-client";
import type { AgentProfileClient } from "./agent-profile-client";

const STORY = {
  id: storyId("story-shell-24"),
  title: "Persisted Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} satisfies Story;

function storyRequests(): StoryClient {
  return {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [{ story: STORY, sourceCount: 0 }],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: STORY,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async (_storyId, identity) => ({
      kind: "completed",
      value: {
        storyId: STORY.id,
        sourceId: sourceId(identity),
        relevance: "Relevant",
        attachedBy: { type: "operator", operatorId: operatorId("operator-24") },
        attachedAt: "attached",
      },
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: { story: STORY, sources: [], assignment: null, transitions: [] },
    })),
    assignStory: vi.fn<StoryClient["assignStory"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
  };
}

function inboxRequests(): SourceInboxClient {
  return {
    listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    recordTriageDecision: vi.fn<SourceInboxClient["recordTriageDecision"]>(async () => ({
      kind: "unavailable",
      message: "The Source Inbox request could not be completed.",
    })),
    prepareEvidence: vi.fn<SourceInboxClient["prepareEvidence"]>(async () => ({
      kind: "unavailable",
      message: "The Source Inbox request could not be completed.",
    })),
  };
}

function agentRequests(): AgentProfileClient {
  return {
    listProfiles: vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    createWriterProfile: vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
      kind: "unavailable",
      message: "The Agent Profile request could not be completed.",
    })),
  };
}

describe("NewsroomShell", () => {
  it("shows only Writer Profiles and moves a successfully assigned Story to Assigned with activity", async () => {
    const writer = {
      id: agentProfileId("writer-0028"),
      role: "writer" as const,
      name: "General Writer",
      instructions: "Write.",
      model: null,
      builtIn: true,
    };
    const editor = {
      id: agentProfileId("editor-0028"),
      role: "assignment_editor" as const,
      name: "Assignment Editor",
      instructions: "Assign.",
      model: null,
      builtIn: true,
    };
    const profiles: AgentProfileClient = {
      listProfiles: vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
        kind: "completed",
        value: [editor, writer],
      })),
      createWriterProfile: vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
        kind: "unavailable",
        message: "The Agent Profile request could not be completed.",
      })),
    };
    const assigned = { ...STORY, state: "assigned" as const, updatedAt: "assigned-at" };
    const assignment = {
      id: assignmentId("assignment-0028"),
      storyId: STORY.id,
      writerProfileId: writer.id,
      sourceIds: [],
      angle: "Angle",
      brief: "Brief",
      constraints: null,
      assignedBy: { type: "operator" as const, operatorId: operatorId("operator-0028") },
      assignedAt: "assigned-at",
    };
    const receipt = {
      transitionId: transitionId("transition-0028"),
      storyId: STORY.id,
      previousState: "intake" as const,
      nextState: "assigned" as const,
      actor: assignment.assignedBy,
      reason: "Ready",
      occurredAt: "assigned-at",
      revisionCycle: 0,
    };
    const stories: StoryClient = {
      ...storyRequests(),
      assignStory: vi.fn<StoryClient["assignStory"]>(async () => ({
        kind: "completed",
        value: { assignment, story: assigned, transitionReceipt: receipt },
      })),
      inspectStory: vi
        .fn<StoryClient["inspectStory"]>()
        .mockResolvedValueOnce({
          kind: "completed",
          value: { story: STORY, sources: [], assignment: null, transitions: [] },
        })
        .mockResolvedValueOnce({
          kind: "completed",
          value: {
            story: assigned,
            sources: [],
            assignment: { assignment, writerProfile: writer },
            transitions: [receipt],
          },
        }),
    };
    render(
      <NewsroomShell
        storyRequests={stories}
        agentProfileRequests={profiles}
        sourceInboxRequests={inboxRequests()}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    expect(await screen.findByRole("option", { name: "General Writer" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Assignment Editor" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Assignment will snapshot all currently attached Sources: 0"),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "Angle" } });
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "Brief" } });
    fireEvent.change(screen.getByLabelText("Assignment reason"), { target: { value: "Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Assignment" }));
    expect(await screen.findByText("Intake → Assigned")).toBeVisible();
    expect(screen.getByText("General Writer")).toBeVisible();
    expect(screen.getByRole("button", { name: "Assigned, 1 story" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("button", { name: "Create Assignment" })).not.toBeInTheDocument();
  });

  it("shows real Story queue counts and the four distinct workspace modes", async () => {
    render(
      <NewsroomShell
        storyRequests={storyRequests()}
        sourceInboxRequests={inboxRequests()}
        agentProfileRequests={agentRequests()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Intake, 1 story" })).toBeVisible(),
    );
    const workspace = screen.getByRole("group", { name: "Workspace view" });
    expect(workspace).toHaveTextContent("Story");
    expect(workspace).toHaveTextContent("Source inbox");
    expect(workspace).toHaveTextContent("Source intake");
    expect(workspace).toHaveTextContent("Agents");
    expect(workspace).not.toHaveTextContent("Assistant");
    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(await screen.findByRole("heading", { name: "Agent Profiles" })).toBeVisible();
    expect(screen.getByText("No agents are running")).toBeVisible();
  });

  it("shows prepared evidence before retained raw evidence after authoritative Story reopen", async () => {
    const source = {
      id: sourceId("source-story-prepared-25"),
      type: "url" as const,
      submittedUrl: "https://example.com/prepared",
      canonicalUrl: "https://example.com/prepared" as never,
      submittedBy: { type: "operator" as const, operatorId: operatorId("operator-25") },
      receivedAt: "received",
    };
    const extraction = {
      id: sourceExtractionId("extraction-story-prepared-25"),
      sourceId: source.id,
      extractor: { key: "firecrawl", version: "v2" },
      requestedBy: source.submittedBy,
      startedAt: "raw-started",
      completedAt: "raw-completed",
      outcome: "succeeded" as const,
      document: {
        format: "markdown" as const,
        content: "# Raw Story evidence",
        title: null,
        byline: null,
        publishedAt: null,
        language: null,
      },
    };
    const preparation = {
      id: sourceEvidencePreparationId("preparation-story-25"),
      sourceId: source.id,
      extractionId: extraction.id,
      model: { provider: "openrouter", model: "operator/model" },
      preparer: { key: "storyrail_evidence_preparer", version: "1" },
      requestedBy: source.submittedBy,
      startedAt: "preparation-started",
      completedAt: "preparation-completed",
      outcome: "succeeded" as const,
      document: {
        format: "markdown" as const,
        content: "# Prepared Story evidence",
        title: null,
        byline: null,
        publishedAt: null,
        language: null,
      },
    };
    const requests: StoryClient = {
      ...storyRequests(),
      listStories: vi.fn<StoryClient["listStories"]>(async () => ({
        kind: "completed",
        value: [{ story: STORY, sourceCount: 1 }],
      })),
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "completed",
        value: {
          story: STORY,
          sources: [
            {
              attachment: {
                storyId: STORY.id,
                sourceId: source.id,
                relevance: "Relevant",
                attachedBy: source.submittedBy,
                attachedAt: "attached",
              },
              source,
              extractions: [extraction],
              preparations: [preparation],
            },
          ],
          assignment: null,
          transitions: [],
        },
      })),
    };
    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    const preparedHeading = await screen.findByRole("heading", { name: "Prepared evidence" });
    const rawHeading = screen.getByRole("heading", { name: "Raw evidence" });
    expect(screen.getByText("# Prepared Story evidence")).toBeVisible();
    expect(screen.getByText("# Raw Story evidence")).toBeVisible();
    expect(
      preparedHeading.compareDocumentPosition(rawHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("loads the database-only Source Inbox as a distinct workspace", async () => {
    const inbox = inboxRequests();
    render(<NewsroomShell storyRequests={storyRequests()} sourceInboxRequests={inbox} />);
    fireEvent.click(screen.getByRole("button", { name: "Source inbox" }));
    expect(await screen.findByText("No Sources await triage")).toBeVisible();
    expect(inbox.listPendingSources).toHaveBeenCalledOnce();
  });

  it("refreshes the authoritative Source Inbox after successful intake without creating a Story", async () => {
    const stories = storyRequests();
    const inbox = inboxRequests();
    const requestSourceEvidence = vi.fn(async () => ({
      kind: "partial-completion" as const,
      stage: "extraction" as const,
      source: {
        id: sourceId("source-new"),
        type: "url" as const,
        submittedUrl: "https://example.com/new",
        canonicalUrl: "https://example.com/new" as never,
        submittedBy: { type: "operator" as const, operatorId: operatorId("operator-24") },
        receivedAt: "received",
      },
      error: {
        code: "SOURCE_NOT_FOUND" as const,
        message: "Controlled.",
        sourceId: sourceId("source-new"),
      },
    }));
    render(
      <NewsroomShell
        storyRequests={stories}
        sourceInboxRequests={inbox}
        requestSourceEvidence={requestSourceEvidence}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    await waitFor(() => expect(inbox.listPendingSources).toHaveBeenCalledTimes(2));
    expect(stories.createStory).not.toHaveBeenCalled();
  });
});
