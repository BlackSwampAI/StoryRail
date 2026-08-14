import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  agentProfileId,
  agentRunId,
  articleId,
  articleRevisionId,
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
      value: {
        story: STORY,
        sources: [],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        article: null,
      },
    })),
    assignStory: vi.fn<StoryClient["assignStory"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    generateAssignmentProposal: vi.fn<StoryClient["generateAssignmentProposal"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    createWriterDraft: vi.fn<StoryClient["createWriterDraft"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    createWriterRevision: vi.fn<StoryClient["createWriterRevision"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    rejectStory: vi.fn<StoryClient["rejectStory"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    submitReview: vi.fn<StoryClient["submitReview"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    runDirectorReview: vi.fn<StoryClient["runDirectorReview"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    recordReviewDecision: vi.fn<StoryClient["recordReviewDecision"]>(async () => ({
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
  it("reviews a supervised suggestion before revealing the editable Assignment form", async () => {
    const writer = {
      id: agentProfileId("writer-0030"),
      role: "writer" as const,
      name: "Suggested Writer",
      instructions: "Write from evidence.",
      model: null,
      builtIn: false,
    };
    const run = {
      id: agentRunId("run-0030"),
      storyId: STORY.id,
      profileId: agentProfileId("storyrail-assignment-editor-v1"),
      role: "assignment_editor" as const,
      operation: "assignment_proposal" as const,
      model: { provider: "openrouter", model: "provider/model" },
      prompt: { key: "storyrail_assignment_editor", version: "1" },
      requestedBy: { type: "operator" as const, operatorId: operatorId("operator-0030") },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "intake" as const, revisionCycle: 0 },
        evidence: [],
        unavailableSourceIds: [],
        writerProfileIds: [writer.id],
      },
      outcome: "succeeded" as const,
      proposal: {
        writerProfileId: writer.id,
        angle: "Suggested angle",
        brief: "Suggested brief",
        constraints: "Suggested constraint",
        reason: "Suggested reason",
      },
    };
    const requests: StoryClient = {
      ...storyRequests(),
      generateAssignmentProposal: vi.fn<StoryClient["generateAssignmentProposal"]>(async () => ({
        kind: "completed",
        value: run,
      })),
    };
    const profiles: AgentProfileClient = {
      ...agentRequests(),
      listProfiles: vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
        kind: "completed",
        value: [writer],
      })),
    };
    render(
      <NewsroomShell
        storyRequests={requests}
        sourceInboxRequests={inboxRequests()}
        agentProfileRequests={profiles}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    expect(await screen.findByRole("heading", { name: "Ready for assignment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ask Assignment Editor" }));
    const proposal = await screen.findByRole("region", { name: "Suggested Writer" });
    expect(within(proposal).getByText("Recommended Writer")).toBeVisible();
    expect(within(proposal).getByText("Custom")).toBeVisible();
    expect(within(proposal).getByRole("heading", { name: "Angle" })).toBeVisible();
    expect(within(proposal).getByText("Suggested angle")).toBeVisible();
    expect(within(proposal).getByRole("heading", { name: "Brief" })).toBeVisible();
    expect(within(proposal).getByText("Suggested brief")).toBeVisible();
    fireEvent.click(within(proposal).getByText("Constraints"));
    expect(within(proposal).getByText("Suggested constraint")).toBeVisible();
    expect(within(proposal).getByRole("heading", { name: "Why this assignment" })).toBeVisible();
    expect(within(proposal).getByText("Suggested reason")).toBeVisible();
    expect(within(proposal).getByRole("button", { name: "Create Assignment" })).toBeVisible();
    expect(within(proposal).getByRole("button", { name: "Edit before assigning" })).toBeVisible();
    expect(within(proposal).getByRole("button", { name: "Regenerate" })).toBeVisible();
    expect(within(proposal).queryByText(run.id)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Angle" })).not.toBeInTheDocument();
    expect(requests.assignStory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit before assigning" }));
    expect(await screen.findByDisplayValue("Suggested angle")).toBeVisible();
    expect(screen.getByDisplayValue("Suggested brief")).toBeVisible();
    expect(screen.getByDisplayValue("Suggested constraint")).toBeVisible();
    expect(screen.getByDisplayValue("Suggested reason")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Angle"), {
      target: { value: "Operator-edited angle" },
    });
    expect(screen.getByDisplayValue("Operator-edited angle")).toBeVisible();
    expect(requests.assignStory).not.toHaveBeenCalled();
    expect(screen.getAllByText("Intake")[0]).toBeVisible();
    fireEvent.click(screen.getByText("History & Audit"));
    expect(screen.getByText("run-0030")).toBeVisible();
    expect(screen.queryByText(/chain-of-thought/i)).not.toBeInTheDocument();
  });

  it("shows a failed run without clearing manually entered Assignment fields", async () => {
    const failedRun = {
      id: agentRunId("run-failed-0030"),
      storyId: STORY.id,
      profileId: agentProfileId("storyrail-assignment-editor-v1"),
      role: "assignment_editor" as const,
      operation: "assignment_proposal" as const,
      model: { provider: "openrouter", model: "provider/model" },
      prompt: { key: "storyrail_assignment_editor", version: "1" },
      requestedBy: { type: "operator" as const, operatorId: operatorId("operator-0030") },
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: { id: STORY.id, title: STORY.title, state: "intake" as const, revisionCycle: 0 },
        evidence: [],
        unavailableSourceIds: [],
        writerProfileIds: [agentProfileId("writer-0030")],
      },
      outcome: "failed" as const,
      failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
    };
    const requests: StoryClient = {
      ...storyRequests(),
      generateAssignmentProposal: vi.fn<StoryClient["generateAssignmentProposal"]>(async () => ({
        kind: "completed",
        value: failedRun,
      })),
    };
    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign manually" }));
    fireEvent.change(await screen.findByLabelText("Angle"), { target: { value: "Manual angle" } });
    fireEvent.click(screen.getByRole("button", { name: "Ask Assignment Editor" }));
    expect(
      await screen.findByText(/^Assignment Editor failed: MODEL_REQUEST_FAILED/),
    ).toBeVisible();
    expect(screen.getByDisplayValue("Manual angle")).toBeVisible();
    expect(screen.getByRole("button", { name: "Ask Assignment Editor" })).toBeEnabled();
  });
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
          value: {
            story: STORY,
            sources: [],
            assignment: null,
            transitions: [],
            agentRuns: [],
            reviewDecisions: [],
            article: null,
          },
        })
        .mockResolvedValueOnce({
          kind: "completed",
          value: {
            story: assigned,
            sources: [],
            assignment: { assignment, writerProfile: writer },
            transitions: [receipt],
            agentRuns: [],
            reviewDecisions: [],
            article: null,
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
    fireEvent.click(await screen.findByRole("button", { name: "Assign manually" }));
    expect(await screen.findByRole("option", { name: "General Writer" })).toBeVisible();
    expect(screen.queryByRole("option", { name: "Assignment Editor" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Assignment will snapshot all currently attached Sources: 0"),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Angle"), { target: { value: "Angle" } });
    fireEvent.change(screen.getByLabelText("Brief"), { target: { value: "Brief" } });
    fireEvent.change(screen.getByLabelText("Assignment reason"), { target: { value: "Ready" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Assignment" }));
    const activeAssignment = await screen.findByRole("region", { name: "Assignment ready" });
    expect(within(activeAssignment).getByText("General Writer")).toBeVisible();
    expect(within(activeAssignment).getByRole("heading", { name: "Angle" })).toBeVisible();
    expect(within(activeAssignment).getAllByText("Angle")).toHaveLength(2);
    expect(within(activeAssignment).getByRole("heading", { name: "Brief" })).toBeVisible();
    expect(within(activeAssignment).getAllByText("Brief")).toHaveLength(2);
    fireEvent.click(within(activeAssignment).getByText("Constraints"));
    expect(within(activeAssignment).getByText("None")).toBeVisible();
    expect(within(activeAssignment).getByRole("button", { name: "Run Writer" })).toBeVisible();
    expect(within(activeAssignment).queryByLabelText("Writer")).not.toBeInTheDocument();
    expect(
      within(activeAssignment).queryByRole("heading", { name: "Article" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assigned, 1 story" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Assigned, 1 story" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const movedStory = within(screen.getByRole("region", { name: "Stories" })).getByRole("button", {
      name: /Persisted Story, Assigned, 0 sources/,
    });
    expect(movedStory).toHaveAttribute("aria-pressed", "true");
    expect(within(movedStory).getByText("Selected")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Assignment" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("History & Audit"));
    expect(screen.getByText("Intake → Assigned")).toBeVisible();
    expect(screen.getByText(assignment.id)).toBeVisible();
  });

  it("nests only the selected queue's Stories inside the consolidated Desk navigation", async () => {
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
    const navigation = screen.getByRole("navigation", { name: "Newsroom navigation" });
    expect(navigation).toHaveTextContent("Inbox");
    expect(navigation).toHaveTextContent("Add Source");
    expect(navigation).toHaveTextContent("Agents");
    expect(navigation).not.toHaveTextContent("On the desk");
    expect(screen.queryByRole("group", { name: "Workspace view" })).not.toBeInTheDocument();
    const storiesRegion = screen.getByRole("region", { name: "Stories" });
    expect(within(storiesRegion).getByRole("button", { name: /Persisted Story/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Intake, 1 story" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.click(within(storiesRegion).getByRole("button", { name: /Persisted Story/ }));
    expect(await screen.findByRole("heading", { name: "Ready for assignment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Intake, 1 story" }));
    expect(screen.getByRole("button", { name: "Intake, 1 story" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      within(storiesRegion).queryByRole("button", { name: /Persisted Story/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready for assignment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Assigned, 0 stories" }));
    expect(screen.getByRole("button", { name: "Assigned, 0 stories" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Assigned, 0 stories" }));
    expect(screen.getByRole("button", { name: "Assigned, 0 stories" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByRole("heading", { name: "Ready for assignment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Intake, 1 story" }));
    const selectedStory = within(storiesRegion).getByRole("button", {
      name: /Persisted Story, Intake, 0 sources/,
    });
    expect(selectedStory).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Assigned, 0 stories" }));
    expect(screen.getByRole("button", { name: "Assigned, 0 stories" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: "Intake, 1 story" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      within(storiesRegion).queryByRole("button", { name: /Persisted Story/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/No Stories in assigned/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready for assignment" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByRole("button", { name: "Assigned, 0 stories" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(await screen.findByRole("heading", { name: "Agent Profiles" })).toBeVisible();
    expect(screen.getByText("No agents are running")).toBeVisible();
  });

  it("adds a durably created Writer to Staff immediately without duplicates", async () => {
    const generalWriter = {
      id: agentProfileId("storyrail-general-writer-v1"),
      role: "writer" as const,
      name: "General Writer",
      instructions: "Write from evidence.",
      model: null,
      builtIn: true,
    };
    const assignmentEditor = {
      id: agentProfileId("storyrail-assignment-editor-v1"),
      role: "assignment_editor" as const,
      name: "Assignment Editor",
      instructions: "Prepare assignments.",
      model: null,
      builtIn: true,
    };
    const createdWriter = {
      id: agentProfileId("instant-writer-0036"),
      role: "writer" as const,
      name: "Instant Writer",
      instructions: "Write concise analysis.",
      model: { provider: "openrouter", model: "sync/model" },
      builtIn: false,
    };
    const createWriterProfile = vi.fn<AgentProfileClient["createWriterProfile"]>(async () => ({
      kind: "completed",
      value: createdWriter,
    }));
    const profiles: AgentProfileClient = {
      listProfiles: vi.fn<AgentProfileClient["listProfiles"]>(async () => ({
        kind: "completed",
        value: [assignmentEditor, generalWriter],
      })),
      createWriterProfile,
    };

    render(
      <NewsroomShell
        storyRequests={storyRequests()}
        sourceInboxRequests={inboxRequests()}
        agentProfileRequests={profiles}
      />,
    );
    const staff = await screen.findByRole("region", { name: "Newsroom Staff" });
    expect(within(staff).getByRole("heading", { name: "General Writer" })).toBeVisible();
    expect(
      within(staff).getByRole("button", { name: "Drag General Writer to an Assignment" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    await screen.findByRole("heading", { name: "Agent Profiles" });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Instant Writer" } });
    fireEvent.change(screen.getByLabelText("Instructions"), {
      target: { value: "Write concise analysis." },
    });
    fireEvent.change(screen.getByLabelText("Provider (optional)"), {
      target: { value: "openrouter" },
    });
    fireEvent.change(screen.getByLabelText("Model identifier (optional)"), {
      target: { value: "sync/model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Writer profile" }));

    expect(
      await within(staff).findByRole("button", { name: "Drag Instant Writer to an Assignment" }),
    ).toBeVisible();
    expect(within(staff).getByRole("heading", { name: "General Writer" })).toBeVisible();
    expect(within(staff).getByText("sync/model")).toBeVisible();
    expect(createWriterProfile).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Intake, 1 story" }));
    fireEvent.click(screen.getByRole("button", { name: "Agents" }));
    await screen.findByRole("heading", { name: "Agent Profiles" });
    expect(within(staff).getAllByRole("heading", { name: "Instant Writer" })).toHaveLength(1);
    expect(within(staff).getByRole("heading", { name: "General Writer" })).toBeVisible();
  });

  it("keeps editorial evidence primary while retaining Story, Source, and raw audit details", async () => {
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
          agentRuns: [],
          reviewDecisions: [],
          article: null,
        },
      })),
    };
    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    expect(await screen.findByText("Evidence")).toBeVisible();
    expect(screen.getByText("# Prepared Story evidence")).not.toBeVisible();
    expect(screen.getByText(STORY.id)).not.toBeVisible();
    expect(screen.getByText(STORY.createdAt)).not.toBeVisible();
    expect(screen.getByText(STORY.updatedAt)).not.toBeVisible();
    fireEvent.click(screen.getByText("Evidence"));
    expect(screen.getByRole("link", { name: source.canonicalUrl })).toBeVisible();
    expect(screen.getByText(/Relevant/)).toBeVisible();
    fireEvent.click(screen.getByText(/Prepared evidence attempt 1/));
    expect(screen.getByText("# Prepared Story evidence")).toBeVisible();
    fireEvent.click(screen.getByText("History & Audit"));
    expect(screen.getByText(STORY.id)).toBeVisible();
    expect(screen.getByText(STORY.createdAt)).toBeVisible();
    expect(screen.getByText(STORY.updatedAt)).toBeVisible();
    expect(screen.getByText(source.id)).toBeVisible();
    expect(screen.getAllByText("operator: operator-25")[0]).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Article" })).not.toBeInTheDocument();
  });

  it("presents branded Source creation as the primary action while Inbox remains navigation", async () => {
    const inbox = inboxRequests();
    render(<NewsroomShell storyRequests={storyRequests()} sourceInboxRequests={inbox} />);

    expect(screen.getByRole("img", { name: "StoryRail" })).toBeVisible();
    const addSource = screen.getByRole("button", { name: "Add Source" });
    const inboxButton = screen.getByRole("button", { name: "Inbox" });
    expect(addSource).not.toHaveAttribute("aria-current");
    expect(await within(inboxButton).findByText("0")).toBeVisible();

    fireEvent.click(addSource);
    expect(
      await screen.findByRole("heading", { name: "Add a Source to the newsroom" }),
    ).toBeVisible();
    expect(addSource).toHaveAttribute("aria-current", "page");
    expect(inboxButton).not.toHaveAttribute("aria-current");

    fireEvent.click(inboxButton);
    expect(await screen.findByText("No Sources await triage")).toBeVisible();
    expect(inboxButton).toHaveAttribute("aria-current", "page");
    expect(addSource).not.toHaveAttribute("aria-current");
    expect(inbox.listPendingSources).toHaveBeenCalledOnce();
  });

  it("refreshes the authoritative Source Inbox after successful intake without creating a Story", async () => {
    const stories = storyRequests();
    const inbox = inboxRequests();
    const source = {
      id: sourceId("source-new"),
      type: "url" as const,
      submittedUrl: "https://example.com/new",
      canonicalUrl: "https://example.com/new" as never,
      submittedBy: { type: "operator" as const, operatorId: operatorId("operator-24") },
      receivedAt: "received",
    };
    const requestSourceEvidence = vi.fn(async () => ({
      kind: "completed" as const,
      source,
      extraction: {
        id: sourceExtractionId("extraction-new"),
        sourceId: source.id,
        extractor: { key: "controlled", version: "1" },
        requestedBy: source.submittedBy,
        startedAt: "started",
        completedAt: "completed",
        outcome: "succeeded" as const,
        document: {
          format: "markdown" as const,
          content: "# Extracted",
          title: null,
          byline: null,
          publishedAt: null,
          language: null,
        },
      },
    }));
    render(
      <NewsroomShell
        storyRequests={stories}
        sourceInboxRequests={inbox}
        requestSourceEvidence={requestSourceEvidence}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Source" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring into newsroom" }));
    await waitFor(() => expect(inbox.listPendingSources).toHaveBeenCalledTimes(2));
    expect(stories.createStory).not.toHaveBeenCalled();
    expect(inbox.prepareEvidence).toHaveBeenCalledWith(source.id, "extraction-new");
    expect(screen.getByText(/Source and extraction are safe/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add another Source" })).toBeVisible();
    expect(screen.getByText("No Sources await triage")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Review in Source Inbox" }));
    expect(await screen.findByText("No Sources await triage")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(screen.getByRole("textbox", { name: "Source URL" })).toHaveValue("");
    expect(screen.queryByText(/Source and extraction are safe/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review in Source Inbox" }),
    ).not.toBeInTheDocument();
  });

  it("clears a duplicate Source receipt after leaving and reopening Source Intake", async () => {
    const requestSourceEvidence = vi.fn(async () => ({
      kind: "preservation-conflict" as const,
      error: {
        code: "DUPLICATE_SOURCE" as const,
        message: "Already exists.",
        existingSourceId: sourceId("source-duplicate"),
        canonicalUrl: "https://example.com/duplicate" as never,
      },
    }));
    render(
      <NewsroomShell
        storyRequests={storyRequests()}
        sourceInboxRequests={inboxRequests()}
        requestSourceEvidence={requestSourceEvidence}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add Source" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring into newsroom" }));
    expect(await screen.findByText("Source already exists")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Inbox" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Source" }));
    expect(screen.getByRole("textbox", { name: "Source URL" })).toHaveValue("");
    expect(screen.queryByText("Source already exists")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Review in Source Inbox" }),
    ).not.toBeInTheDocument();
  });

  it("runs only the assigned Writer and keeps retry available after a durable failure", async () => {
    const assigned = { ...STORY, state: "assigned" as const, updatedAt: "assigned" };
    const writer = {
      id: agentProfileId("writer-31"),
      role: "writer" as const,
      name: "Assigned Writer",
      instructions: "Write.",
      model: null,
      builtIn: true,
    };
    const assignment = {
      id: assignmentId("assignment-31"),
      storyId: assigned.id,
      writerProfileId: writer.id,
      sourceIds: [sourceId("source-31")],
      angle: "Angle",
      brief: "Brief",
      constraints: null,
      assignedBy: { type: "operator" as const, operatorId: operatorId("operator-31") },
      assignedAt: "assigned",
    };
    const failedRun = {
      id: agentRunId("writer-run-31"),
      storyId: assigned.id,
      profileId: writer.id,
      role: "writer" as const,
      operation: "article_draft" as const,
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: assignment.assignedBy,
      startedAt: "started",
      completedAt: "completed",
      input: {
        story: {
          id: assigned.id,
          title: assigned.title,
          state: "assigned" as const,
          revisionCycle: 0,
        },
        assignment: {
          id: assignment.id,
          storyId: assignment.storyId,
          writerProfileId: assignment.writerProfileId,
          sourceIds: assignment.sourceIds,
          angle: assignment.angle,
          brief: assignment.brief,
          constraints: assignment.constraints,
        },
        evidence: [
          {
            sourceId: sourceId("source-31"),
            relevance: "Primary",
            evidenceKind: "raw" as const,
            evidenceId: sourceExtractionId("extraction-31"),
          },
        ],
        unavailableSourceIds: [],
      },
      outcome: "failed" as const,
      failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true },
    };
    const requests: StoryClient = {
      ...storyRequests(),
      listStories: vi.fn(async () => ({
        kind: "completed" as const,
        value: [{ story: assigned, sourceCount: 1 }],
      })),
      inspectStory: vi.fn(async () => ({
        kind: "completed" as const,
        value: {
          story: assigned,
          sources: [],
          assignment: { assignment, writerProfile: writer },
          transitions: [],
          agentRuns: [],
          reviewDecisions: [],
          article: null,
        },
      })),
      createWriterDraft: vi.fn(async () => ({ kind: "completed" as const, value: failedRun })),
    };
    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: /Assigned, 1 story/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));
    const runWriter = await screen.findByRole("button", { name: "Run Writer" });
    expect(screen.queryByLabelText("Writer")).not.toBeInTheDocument();
    fireEvent.click(runWriter);
    expect(await screen.findByText(/Writer failed: MODEL_REQUEST_FAILED/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Run Writer" })).toBeEnabled();
    expect(requests.createWriterDraft).toHaveBeenCalledWith(assigned.id);
    fireEvent.click(screen.getByText("History & Audit"));
    expect(screen.getByText(failedRun.id)).toBeVisible();
  });

  it("keeps a drafted Story selected while moving its nested card to In Progress", async () => {
    const assigned = { ...STORY, state: "assigned" as const, updatedAt: "assigned" };
    const inProgress = { ...assigned, state: "in_progress" as const, updatedAt: "drafted" };
    const writer = {
      id: agentProfileId("writer-transition-32"),
      role: "writer" as const,
      name: "Transition Writer",
      instructions: "Write.",
      model: null,
      builtIn: true,
    };
    const assignment = {
      id: assignmentId("assignment-transition-32"),
      storyId: assigned.id,
      writerProfileId: writer.id,
      sourceIds: [],
      angle: "Transition angle",
      brief: "Transition brief",
      constraints: null,
      assignedBy: { type: "operator" as const, operatorId: operatorId("operator-32") },
      assignedAt: "assigned",
    };
    const articleIdentity = articleId("article-transition-32");
    const revisionIdentity = articleRevisionId("revision-transition-32");
    const writerRunIdentity = agentRunId("writer-run-transition-32");
    const successfulRun = {
      id: writerRunIdentity,
      storyId: assigned.id,
      profileId: writer.id,
      role: "writer" as const,
      operation: "article_draft" as const,
      model: { provider: "openrouter", model: "writer-model" },
      prompt: { key: "storyrail_writer_draft", version: "1" },
      requestedBy: assignment.assignedBy,
      startedAt: "started",
      completedAt: "drafted",
      input: {
        story: {
          id: assigned.id,
          title: assigned.title,
          state: "assigned" as const,
          revisionCycle: 0,
        },
        assignment: {
          id: assignment.id,
          storyId: assignment.storyId,
          writerProfileId: assignment.writerProfileId,
          sourceIds: assignment.sourceIds,
          angle: assignment.angle,
          brief: assignment.brief,
          constraints: assignment.constraints,
        },
        evidence: [],
        unavailableSourceIds: [],
      },
      outcome: "succeeded" as const,
      articleId: articleIdentity,
      revisionId: revisionIdentity,
    };
    const assignedInspection = {
      story: assigned,
      sources: [],
      assignment: { assignment, writerProfile: writer },
      transitions: [],
      agentRuns: [],
      reviewDecisions: [],
      article: null,
    };
    const draftedInspection = {
      ...assignedInspection,
      story: inProgress,
      agentRuns: [successfulRun],
      reviewDecisions: [],
      article: {
        article: {
          id: articleIdentity,
          storyId: inProgress.id,
          assignmentId: assignment.id,
          createdAt: "drafted",
        },
        revisions: [
          {
            id: revisionIdentity,
            articleId: articleIdentity,
            revisionNumber: 1 as const,
            writerProfileId: writer.id,
            agentRunId: writerRunIdentity,
            headline: "Transition article",
            dek: null,
            bodyMarkdown: "The drafted body.",
            createdBy: {
              type: "agent" as const,
              role: "writer" as const,
              runId: writerRunIdentity,
            },
            createdAt: "drafted",
          },
        ],
      },
    };
    const requests: StoryClient = {
      ...storyRequests(),
      listStories: vi.fn(async () => ({
        kind: "completed" as const,
        value: [{ story: assigned, sourceCount: 0 }],
      })),
      inspectStory: vi
        .fn<StoryClient["inspectStory"]>()
        .mockResolvedValueOnce({ kind: "completed", value: assignedInspection })
        .mockResolvedValueOnce({ kind: "completed", value: draftedInspection }),
      createWriterDraft: vi.fn(async () => ({
        kind: "completed" as const,
        value: successfulRun,
      })),
    };

    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Assigned, 1 story" }));
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story, Assigned/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Run Writer" }));

    expect(await screen.findByRole("heading", { name: "Transition article" })).toBeVisible();
    expect(screen.getByRole("button", { name: "In progress, 1 story" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    const movedStory = screen.getByRole("button", {
      name: /Persisted Story, In progress, 0 sources/,
    });
    expect(movedStory).toHaveAttribute("aria-pressed", "true");
    expect(within(movedStory).getByText("Selected")).toBeVisible();
    expect(screen.getByRole("button", { name: "Assigned, 0 stories" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("makes the latest Article primary, renders Markdown readably, and keeps raw source secondary", async () => {
    const inProgress = { ...STORY, state: "in_progress" as const, updatedAt: "drafted" };
    const writer = {
      id: agentProfileId("writer-article-32"),
      role: "writer" as const,
      name: "News Writer",
      instructions: "Write.",
      model: null,
      builtIn: true,
    };
    const assignment = {
      id: assignmentId("assignment-article-32"),
      storyId: inProgress.id,
      writerProfileId: writer.id,
      sourceIds: [],
      angle: "Reader-first angle",
      brief: "Readable brief",
      constraints: null,
      assignedBy: { type: "operator" as const, operatorId: operatorId("operator-32") },
      assignedAt: "assigned",
    };
    const bodyMarkdown =
      "## What happened\n\nReadable **editorial copy** with a [source](https://example.com/report).\n\n<script>alert('unsafe')</script>";
    const articleIdentity = articleId("article-32");
    const revisionIdentity = articleRevisionId("revision-32");
    const requests: StoryClient = {
      ...storyRequests(),
      listStories: vi.fn(async () => ({
        kind: "completed" as const,
        value: [{ story: inProgress, sourceCount: 0 }],
      })),
      inspectStory: vi.fn(async () => ({
        kind: "completed" as const,
        value: {
          story: inProgress,
          sources: [],
          assignment: { assignment, writerProfile: writer },
          transitions: [],
          agentRuns: [],
          reviewDecisions: [],
          article: {
            article: {
              id: articleIdentity,
              storyId: inProgress.id,
              assignmentId: assignment.id,
              createdAt: "drafted",
            },
            revisions: [
              {
                id: revisionIdentity,
                articleId: articleIdentity,
                revisionNumber: 1 as const,
                writerProfileId: writer.id,
                agentRunId: agentRunId("writer-run-article-32"),
                headline: "A readable newsroom headline",
                dek: "A clear editorial deck.",
                bodyMarkdown,
                createdBy: {
                  type: "agent" as const,
                  role: "writer" as const,
                  runId: agentRunId("writer-run-article-32"),
                },
                createdAt: "drafted",
              },
            ],
          },
        },
      })),
    };
    render(<NewsroomShell storyRequests={requests} sourceInboxRequests={inboxRequests()} />);
    fireEvent.click(await screen.findByRole("button", { name: "In progress, 1 story" }));
    fireEvent.click(await screen.findByRole("button", { name: /Persisted Story/ }));

    expect(
      await screen.findByRole("heading", { name: "A readable newsroom headline" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "A readable newsroom headline" })).toBeVisible();
    expect(document.querySelectorAll("#current-task-heading")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "What happened" })).toBeVisible();
    expect(screen.getByText("editorial copy")).toBeVisible();
    expect(screen.getByRole("link", { name: "source" })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
    expect(screen.getByRole("button", { name: "Send to Review" })).toBeVisible();
    expect(screen.getByText("Revision 1 source Markdown")).not.toBeVisible();
    expect(document.querySelector("script")).toBeNull();

    fireEvent.click(screen.getByText("History & Audit"));
    fireEvent.click(screen.getByText("Revision 1 source Markdown"));
    expect(
      screen.getByText(
        (_, element) => element?.tagName === "PRE" && element.textContent === bodyMarkdown,
      ),
    ).toBeVisible();
    expect(screen.getByText(articleIdentity)).toBeVisible();
    expect(screen.getByText(revisionIdentity)).toBeVisible();
  });
});
