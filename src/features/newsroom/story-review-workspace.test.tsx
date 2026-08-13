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
  createWriterRevision: vi.fn(unavailable),
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

  it("offers the bounded Writer revision after an operator requests changes", async () => {
    const reviewed = inspection();
    const revisionRequested = {
      ...reviewed,
      story: { ...reviewed.story, state: "changes_requested" as const, revisionCycle: 1 },
      reviewDecisions: [
        {
          id: "decision-41",
          storyId: reviewed.story.id,
          articleId: reviewed.article!.article.id,
          revisionId: reviewed.article!.revisions[0]!.id,
          directorRunId: reviewed.agentRuns[0]!.id,
          decision: "request_changes" as const,
          reason: "Support the timeline or remove the claim.",
          decidedBy: { type: "operator" as const, operatorId: "operator-38" },
          decidedAt: "decided",
        },
      ],
    } as unknown as StoryInspection;
    const createWriterRevision = vi.fn<StoryClient["createWriterRevision"]>(async () => ({
      kind: "application-failure",
      error: { code: "WRITER_EVIDENCE_UNAVAILABLE", message: "Evidence unavailable." },
    }));

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={revisionRequested}
          requests={{ ...requests, createWriterRevision }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    expect(screen.getByRole("heading", { name: "Create Article Revision 2" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Run Writer Revision" }));
    expect(createWriterRevision).toHaveBeenCalledWith(reviewed.story.id);
    expect(await screen.findByText("Evidence unavailable.")).toBeVisible();
  });

  it("requires a fresh Director run for the newly revised Article", () => {
    const reviewed = inspection();
    const firstRevision = reviewed.article!.revisions[0]!;
    const revised = {
      ...reviewed,
      story: { ...reviewed.story, state: "in_review" as const, revisionCycle: 1 },
      article: {
        article: reviewed.article!.article,
        revisions: [
          firstRevision,
          {
            ...firstRevision,
            id: "revision-41-2",
            revisionNumber: 2 as const,
            agentRunId: "writer-run-41-2",
            headline: "Revised Article headline",
            createdBy: {
              type: "agent" as const,
              role: "writer" as const,
              runId: "writer-run-41-2",
            },
            createdAt: "revised",
          },
        ],
      },
    } as unknown as StoryInspection;

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={revised}
          requests={requests}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    expect(screen.getByRole("button", { name: "Run Director" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Request changes" })).not.toBeInTheDocument();
  });

  it("shows the shared pending surface and no action while Writer revision is active", async () => {
    const reviewed = inspection();
    const revisionRequested = {
      ...reviewed,
      story: { ...reviewed.story, state: "changes_requested" as const, revisionCycle: 1 },
      reviewDecisions: [
        {
          id: "decision-pending-41",
          storyId: reviewed.story.id,
          articleId: reviewed.article!.article.id,
          revisionId: reviewed.article!.revisions[0]!.id,
          directorRunId: reviewed.agentRuns[0]!.id,
          decision: "request_changes" as const,
          reason: "Revise it.",
          decidedBy: { type: "operator" as const, operatorId: "operator-38" },
          decidedAt: "decided",
        },
      ],
    } as unknown as StoryInspection;
    const createWriterRevision = vi.fn<StoryClient["createWriterRevision"]>(
      async () => new Promise<never>(() => undefined),
    );
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={revisionRequested}
          requests={{ ...requests, createWriterRevision }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Writer Revision" }));
    const pending = await screen.findByRole("status", {
      name: "Writer is revising the Article…",
    });
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("heading", { name: "Article headline" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Run Writer Revision" })).not.toBeInTheDocument();
  });

  it("uses the shared pending surface for Director review", async () => {
    const reviewed = inspection();
    const awaitingDirector = { ...reviewed, agentRuns: [] } as StoryInspection;
    const runDirectorReview = vi.fn<StoryClient["runDirectorReview"]>(
      async () => new Promise<never>(() => undefined),
    );
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={awaitingDirector}
          requests={{ ...requests, runDirectorReview }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Director" }));
    expect(
      await screen.findByRole("status", { name: "Director is reviewing the Article…" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Run Director" })).not.toBeInTheDocument();
  });

  it("uses the shared pending surface for the initial Writer", async () => {
    const reviewed = inspection();
    const assigned = {
      ...reviewed,
      story: { ...reviewed.story, state: "assigned" as const },
      article: null,
      agentRuns: [],
    } as StoryInspection;
    const createWriterDraft = vi.fn<StoryClient["createWriterDraft"]>(
      async () => new Promise<never>(() => undefined),
    );
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={assigned}
          requests={{ ...requests, createWriterDraft }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run Writer" }));
    expect(
      await screen.findByRole("status", { name: "Writer is drafting the Article…" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Run Writer" })).not.toBeInTheDocument();
  });

  it("uses the shared pending surface for the Assignment Editor", async () => {
    const reviewed = inspection();
    const intake = {
      ...reviewed,
      story: { ...reviewed.story, state: "intake" as const },
      assignment: null,
      article: null,
      agentRuns: [],
      reviewDecisions: [],
    } as StoryInspection;
    const generateAssignmentProposal = vi.fn<StoryClient["generateAssignmentProposal"]>(
      async () => new Promise<never>(() => undefined),
    );
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={intake}
          requests={{ ...requests, generateAssignmentProposal }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ask Assignment Editor" }));
    expect(
      await screen.findByRole("status", {
        name: "Assignment Editor is preparing a recommendation…",
      }),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button", { name: "Ask Assignment Editor" })).not.toBeInTheDocument();
  });
});
