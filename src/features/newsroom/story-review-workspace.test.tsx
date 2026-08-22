import { DragDropProvider } from "@dnd-kit/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  startAutopilot: vi.fn(unavailable),
  generateAssignmentProposal: vi.fn(unavailable),
  createWriterDraft: vi.fn(unavailable),
  createWriterRevision: vi.fn(unavailable),
  rejectStory: vi.fn(unavailable),
  publishStory: vi.fn(unavailable),
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
    blocks: [{ kind: "context", markdown: "Article body.", citations: [] }],
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
            bodyMarkdown: "Article body.",
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
  it("requires a deliberate reason before requesting operator rejection", async () => {
    const rejectStory = vi.fn<StoryClient["rejectStory"]>(async () => ({
      kind: "application-failure",
      error: { code: "STORY_REJECTION_CONFLICT", message: "Story changed." },
    }));
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={inspection()}
          requests={{ ...requests, rejectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject Story" }));
    const confirm = screen.getByRole("button", { name: "Reject Story" });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "The reporting no longer supports this Story." },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(rejectStory).toHaveBeenCalledWith(
      "story-38",
      "The reporting no longer supports this Story.",
    );
    expect(await screen.findByText("Story changed.")).toBeVisible();
  });

  it("cancels inline rejection without submitting or retaining the draft reason", () => {
    const rejectStory = vi.fn<StoryClient["rejectStory"]>();
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={inspection()}
          requests={{ ...requests, rejectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject Story" }));
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: "Draft reason" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(rejectStory).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Rejection reason")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reject Story" }));
    expect(screen.getByLabelText("Rejection reason")).toHaveValue("");
  });

  it("reports the rejected Story and receipt immediately while authoritative refresh proceeds", async () => {
    const reviewed = inspection();
    const rejectedStory = { ...reviewed.story, state: "rejected" as const, updatedAt: "rejected" };
    const transitionReceipt = {
      transitionId: "transition-43",
      storyId: reviewed.story.id,
      previousState: "in_review" as const,
      nextState: "rejected" as const,
      actor: { type: "operator" as const, operatorId: "operator-43" },
      reason: "The reporting no longer supports publication.",
      occurredAt: "rejected",
      revisionCycle: reviewed.story.revisionCycle,
    };
    const rejectStory = vi.fn<StoryClient["rejectStory"]>(async () => ({
      kind: "completed",
      value: { story: rejectedStory, transitionReceipt } as never,
    }));
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(
      async () => new Promise<never>(() => undefined),
    );
    const onReviewStateChanged = vi.fn();
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={reviewed}
          requests={{ ...requests, rejectStory, inspectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={onReviewStateChanged}
        />
      </DragDropProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reject Story" }));
    fireEvent.change(screen.getByLabelText("Rejection reason"), {
      target: { value: transitionReceipt.reason },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject Story" }));

    await waitFor(() =>
      expect(onReviewStateChanged).toHaveBeenCalledWith({
        ...reviewed,
        story: rejectedStory,
        transitions: [...reviewed.transitions, transitionReceipt],
      }),
    );
    expect(inspectStory).toHaveBeenCalledWith(reviewed.story.id);
  });

  it("shows a durable rejection reason while preserving Article and audit access", () => {
    const reviewed = inspection();
    const rejected = {
      ...reviewed,
      story: { ...reviewed.story, state: "rejected" as const, updatedAt: "rejected" },
      transitions: [
        {
          transitionId: "transition-43",
          storyId: reviewed.story.id,
          previousState: "in_review" as const,
          nextState: "rejected" as const,
          actor: { type: "operator" as const, operatorId: "operator-43" },
          reason: "The reporting no longer supports publication.",
          occurredAt: "rejected",
          revisionCycle: reviewed.story.revisionCycle,
        },
      ],
    };
    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={rejected as unknown as StoryInspection}
          requests={requests}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    const rejectionHeading = screen.getByRole("heading", { name: "Story rejected" });
    const articleHeading = screen.getByRole("heading", { name: "Article headline" });
    expect(rejectionHeading).toBeVisible();
    expect(
      rejectionHeading.compareDocumentPosition(articleHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getAllByText("The reporting no longer supports publication.").length,
    ).toBeGreaterThan(0);
    expect(articleHeading).toBeVisible();
    expect(screen.getByText("Evidence")).toBeVisible();
    expect(screen.getByText("History & Audit")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reject Story" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run Director" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record decision" })).not.toBeInTheDocument();
  });

  it.each(["approved", "rejected", "published"] as const)(
    "does not offer rejection from %s",
    (state) => {
      const value = inspection();
      render(
        <DragDropProvider>
          <StoryWorkspace
            inspection={{ ...value, story: { ...value.story, state } }}
            requests={requests}
            staff={{ kind: "loaded", profiles: [] }}
            onAssigned={vi.fn()}
            onWriterCompleted={vi.fn()}
            onReviewStateChanged={vi.fn()}
          />
        </DragDropProvider>,
      );

      expect(screen.queryByRole("button", { name: "Reject Story" })).not.toBeInTheDocument();
    },
  );

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

  it("keeps approval available without offering request changes after both revision cycles", () => {
    const reviewed = inspection();
    const revision = reviewed.article!.revisions[0]!;
    const directorRun = reviewed.agentRuns[0]! as Extract<
      StoryInspection["agentRuns"][number],
      { readonly role: "editor_in_chief" }
    >;
    const finalRevision = {
      ...revision,
      id: "revision-38-3",
      revisionNumber: 3 as const,
      agentRunId: "writer-run-38-3",
    };
    const finalReview = {
      ...reviewed,
      story: { ...reviewed.story, revisionCycle: 2 },
      article: {
        article: reviewed.article!.article,
        revisions: [finalRevision],
      },
      agentRuns: [
        {
          ...directorRun,
          input: {
            ...directorRun.input,
            story: { ...directorRun.input.story, revisionCycle: 2 },
            revision: {
              ...directorRun.input.revision,
              id: finalRevision.id,
              revisionNumber: finalRevision.revisionNumber,
              agentRunId: finalRevision.agentRunId,
            },
          },
        },
      ],
    } as unknown as StoryInspection;

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={finalReview}
          requests={requests}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    expect(screen.getByRole("heading", { name: "Request changes" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Request changes" })).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Both revision cycles have been used. Request changes is no longer available for this Article revision.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve" })).toBeVisible();
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
    expect(screen.getByRole("button", { name: "Reject Story" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Reject Story" })).toBeDisabled();
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

describe("in-flight agent runs", () => {
  function runningDirectorRun(base: StoryInspection) {
    const [existing] = base.agentRuns;
    if (!existing) throw new Error("The fixture must provide a Director run to adapt.");
    const { review: _review, ...common } = existing as never as {
      review: unknown;
    } & Record<string, unknown>;
    return { ...common, completedAt: null, outcome: "running" };
  }

  function inReview(): StoryInspection {
    const reviewed = inspection();
    return { ...reviewed, story: { ...reviewed.story, state: "in_review" } } as StoryInspection;
  }

  it("shows the Director as running from the durable record alone", async () => {
    const base = inReview();
    const running = {
      ...base,
      agentRuns: [runningDirectorRun(base)],
    } as unknown as StoryInspection;

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={running}
          requests={requests}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    // Nothing was clicked: the workspace rejoins a run that was already under way.
    expect(await screen.findByText("Director is reviewing the Article…")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Run Director" })).not.toBeInTheDocument();
  });

  it("follows an in-flight run and reports the Story once it settles", async () => {
    const base = inReview();
    const running = {
      ...base,
      agentRuns: [runningDirectorRun(base)],
    } as unknown as StoryInspection;
    const inspectStory = vi.fn(async () => ({ kind: "completed" as const, value: base }));
    const onWriterCompleted = vi.fn();

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={running}
          requests={{ ...requests, inspectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={onWriterCompleted}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    await waitFor(() => expect(inspectStory).toHaveBeenCalledWith(base.story.id), {
      timeout: 5_000,
    });
    await waitFor(() => expect(onWriterCompleted).toHaveBeenCalledWith(base), { timeout: 5_000 });
  });

  it("shows the proposal a followed run produced, without a click", async () => {
    const base = inspection();
    const proposalRun = {
      id: "assignment-run-57",
      storyId: base.story.id,
      profileId: "storyrail-assignment-editor-v1",
      role: "assignment_editor",
      operation: "assignment_proposal",
      model: { provider: "openrouter", model: "editor-model" },
      prompt: { key: "storyrail_assignment_editor", version: "1" },
      requestedBy: { type: "operator", operatorId: "operator-38" },
      startedAt: "start",
      input: {
        story: { id: base.story.id, title: base.story.title, state: "intake", revisionCycle: 0 },
        evidence: [
          {
            sourceId: "source-38",
            relevance: "Relevant",
            evidenceKind: "raw",
            evidenceId: "extraction-38",
          },
        ],
        unavailableSourceIds: [],
        writerProfileIds: ["writer-38"],
      },
    };
    const intake = {
      ...base,
      story: { ...base.story, state: "intake" },
      assignment: null,
      article: null,
    } as unknown as StoryInspection;
    const running = {
      ...intake,
      agentRuns: [{ ...proposalRun, completedAt: null, outcome: "running" }],
    } as unknown as StoryInspection;
    const settled = {
      ...intake,
      agentRuns: [
        {
          ...proposalRun,
          completedAt: "end",
          outcome: "succeeded",
          proposal: {
            writerProfileId: "writer-38",
            angle: "A followed angle",
            brief: "A followed brief",
            constraints: null,
            reason: "Because the evidence supports it",
          },
        },
      ],
    } as unknown as StoryInspection;
    const inspectStory = vi.fn(async () => ({ kind: "completed" as const, value: settled }));

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={running}
          requests={{ ...requests, inspectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    expect(
      await screen.findByText("Assignment Editor is preparing a recommendation…"),
    ).toBeVisible();
    // The suggestion card appears on its own, driven by the run the workspace followed.
    expect(
      await screen.findByText("Assignment Editor suggestion", {}, { timeout: 5_000 }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Angle" })).toBeVisible();
  });

  it("stops inspecting once no run is in flight", async () => {
    const inspectStory = vi.fn(async () => ({ kind: "completed" as const, value: inReview() }));

    render(
      <DragDropProvider>
        <StoryWorkspace
          inspection={inReview()}
          requests={{ ...requests, inspectStory }}
          staff={{ kind: "loaded", profiles: [] }}
          onAssigned={vi.fn()}
          onWriterCompleted={vi.fn()}
          onReviewStateChanged={vi.fn()}
        />
      </DragDropProvider>,
    );

    await new Promise((resolve) => setTimeout(resolve, 2_000));
    expect(inspectStory).not.toHaveBeenCalled();
  });
});
