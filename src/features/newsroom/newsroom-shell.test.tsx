import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
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
      value: { story: STORY, sources: [] },
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
