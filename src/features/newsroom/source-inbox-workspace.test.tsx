import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  storyId,
  type CanonicalSourceUrl,
  type SourceExtraction,
  type SourceEvidencePreparation,
  type Story,
  type StorySourceAttachment,
  type UrlSource,
} from "@/domain/editorial";

import { SOURCE_INBOX_UNAVAILABLE_MESSAGE, type SourceInboxClient } from "./source-inbox-client";
import { SourceInboxWorkspace, type SourceInboxWorkspaceProps } from "./source-inbox-workspace";
import type { StoryClient } from "./story-client";

const actor = { type: "operator", operatorId: operatorId("operator-24") } as const;
const source = {
  id: sourceId("source-24"),
  type: "url",
  submittedUrl: "https://example.com/report?submitted=true",
  canonicalUrl: "https://example.com/report" as CanonicalSourceUrl,
  submittedBy: actor,
  receivedAt: "received-time",
} satisfies UrlSource;
const extraction = {
  id: sourceExtractionId("extraction-24"),
  sourceId: source.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: actor,
  startedAt: "start",
  completedAt: "complete",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Persisted evidence",
    title: "Extracted title",
    byline: null,
    publishedAt: null,
    language: null,
  },
} satisfies SourceExtraction;
const item = { source, extractions: [extraction], preparations: [] } as const;
const failedExtraction = {
  id: sourceExtractionId("extraction-24-failed"),
  sourceId: source.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: actor,
  startedAt: "start",
  completedAt: "complete",
  outcome: "failed",
  failure: { code: "RESPONSE_REJECTED", retryable: false },
} satisfies SourceExtraction;
const unextractedItem = { source, extractions: [failedExtraction], preparations: [] } as const;
const retriedExtraction = {
  ...extraction,
  id: sourceExtractionId("extraction-24-retried"),
} satisfies SourceExtraction;
const preparation = {
  id: sourceEvidencePreparationId("preparation-25"),
  sourceId: source.id,
  extractionId: extraction.id,
  model: { provider: "openrouter", model: "operator/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  input: { rawCharacters: 512, submittedCharacters: 512 },
  requestedBy: actor,
  startedAt: "preparation-started",
  completedAt: "preparation-completed",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Prepared evidence",
    title: "Prepared title",
    byline: null,
    publishedAt: null,
    language: "en",
  },
} satisfies SourceEvidencePreparation;
const story = {
  id: storyId("story-24"),
  title: "Existing Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "created",
  updatedAt: "updated",
} satisfies Story;
const attachment = {
  storyId: story.id,
  sourceId: source.id,
  relevance: "Relevant",
  attachedBy: actor,
  attachedAt: "attached",
} satisfies StorySourceAttachment;

function clients() {
  const inbox: SourceInboxClient = {
    listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
      kind: "completed",
      value: [item],
    })),
    recordTriageDecision: vi.fn<SourceInboxClient["recordTriageDecision"]>(
      async (_sourceId, decision, storyId, reason) => ({
        kind: "completed",
        value: {
          sourceId: source.id,
          decision,
          storyId: storyId === null ? null : (storyId as Story["id"]),
          reason,
          decidedBy: actor,
          decidedAt: "decided",
        },
      }),
    ),
    prepareEvidence: vi.fn<SourceInboxClient["prepareEvidence"]>(async () => ({
      kind: "completed",
      value: preparation,
    })),
    retryExtraction: vi.fn<SourceInboxClient["retryExtraction"]>(async () => ({
      kind: "completed",
      value: retriedExtraction,
    })),
  };
  const stories: StoryClient = {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: story,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "completed",
      value: attachment,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: {
        story,
        sources: [{ attachment, source, extractions: [extraction], preparations: [] }],
        assignment: null,
        transitions: [],
        agentRuns: [],
        reviewDecisions: [],
        deliveries: [],
        toolCalls: [],
        article: null,
      },
    })),
    assignStory: vi.fn<StoryClient["assignStory"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    startSourceResearch: vi.fn<StoryClient["startSourceResearch"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
    startAutopilot: vi.fn<StoryClient["startAutopilot"]>(async () => ({
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
    publishStory: vi.fn<StoryClient["publishStory"]>(async () => ({
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
    deliverStory: vi.fn<StoryClient["deliverStory"]>(async () => ({
      kind: "unavailable",
      message: "The Story request could not be completed.",
    })),
  };
  return { inbox, stories };
}

function renderInbox(
  inbox: SourceInboxClient,
  stories: StoryClient,
  options: {
    readonly sourceCount?: number;
    readonly onStoryKnown?: SourceInboxWorkspaceProps["onStoryKnown"];
    readonly onStoryLoaded?: SourceInboxWorkspaceProps["onStoryLoaded"];
    readonly onPendingCountChange?: SourceInboxWorkspaceProps["onPendingCountChange"];
  } = {},
) {
  return render(
    <SourceInboxWorkspace
      refreshVersion={0}
      stories={[{ story, sourceCount: options.sourceCount ?? 0 }]}
      inboxRequests={inbox}
      storyRequests={stories}
      onPendingCountChange={options.onPendingCountChange}
      onStoryKnown={options.onStoryKnown ?? vi.fn()}
      onStoryLoaded={options.onStoryLoaded ?? vi.fn()}
    />,
  );
}

describe("SourceInboxWorkspace", () => {
  it("shows one recovery preparation action and triage controls before raw history is expanded", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    expect(screen.getByText("Loading pending Sources…")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Prepare evidence" })).toBeVisible();
    expect(screen.getByText("# Persisted evidence")).not.toBeVisible();
    expect(screen.getByText("Preparation history").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Raw extraction history").closest("details")).not.toHaveAttribute(
      "open",
    );
    expect(screen.getByRole("button", { name: "Create new Story" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Attach to existing Story" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Skip" })).toBeVisible();

    fireEvent.click(screen.getByText("Raw extraction history"));
    expect(screen.getByText("# Persisted evidence")).toBeVisible();
  });

  it("prepares the selected successful extraction while retaining raw evidence and pending triage", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);
    fireEvent.click(await screen.findByRole("button", { name: "Prepare evidence" }));
    expect(await screen.findByText("Prepared evidence recorded")).toBeVisible();
    expect(inbox.prepareEvidence).toHaveBeenCalledWith(source.id, extraction.id);
    expect(screen.getByRole("heading", { name: "Prepared evidence" })).toBeVisible();
    expect(screen.getByText("# Persisted evidence")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare again" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Create new Story" })).toBeVisible();

    fireEvent.click(screen.getByText("Raw extraction history"));
    expect(screen.getByText("# Persisted evidence")).toBeVisible();
  });

  it("prioritizes existing prepared evidence and prepares the same extraction again", async () => {
    const { inbox, stories } = clients();
    const preparedInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ ...item, preparations: [preparation] }],
      })),
    };
    renderInbox(preparedInbox, stories);

    expect(await screen.findByRole("heading", { name: "Prepared evidence" })).toBeVisible();
    expect(screen.getByText("# Persisted evidence")).not.toBeVisible();
    expect(screen.getByText("Preparation history").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByRole("button", { name: "Prepare again" }));
    expect(preparedInbox.prepareEvidence).toHaveBeenCalledWith(source.id, extraction.id);
  });

  it("targets the latest successful extraction for recovery", async () => {
    const { inbox, stories } = clients();
    const newerExtraction = {
      ...extraction,
      id: sourceExtractionId("extraction-26"),
      document: { ...extraction.document, title: "Newer extraction" },
    } satisfies SourceExtraction;
    const multipleInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ ...item, extractions: [extraction, newerExtraction] }],
      })),
    };
    renderInbox(multipleInbox, stories);

    fireEvent.click(await screen.findByRole("button", { name: "Prepare evidence" }));
    expect(multipleInbox.prepareEvidence).toHaveBeenCalledWith(source.id, newerExtraction.id);
  });

  it("says so when the model only read part of the raw extraction", async () => {
    const { inbox, stories } = clients();
    const partial = {
      ...preparation,
      input: { rawCharacters: 480_000, submittedCharacters: 120_000 },
    } satisfies SourceEvidencePreparation;
    const partialInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ ...item, preparations: [partial] }],
      })),
    };
    renderInbox(partialInbox, stories);

    const history = (await screen.findByText(/Preparation history/)).closest("details");
    fireEvent.click(within(history as HTMLElement).getByText(/Preparation history/));

    expect(
      await screen.findByText(
        "The model read the first 120,000 of 480,000 characters (25%) of the raw extraction.",
      ),
    ).toBeVisible();
  });

  it("stays silent when the model read the whole raw extraction", async () => {
    const { inbox, stories } = clients();
    const whole = {
      ...preparation,
      input: { rawCharacters: 4_096, submittedCharacters: 4_096 },
    } satisfies SourceEvidencePreparation;
    const wholeInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ ...item, preparations: [whole] }],
      })),
    };
    renderInbox(wholeInbox, stories);

    const history = (await screen.findByText(/Preparation history/)).closest("details");
    fireEvent.click(within(history as HTMLElement).getByText(/Preparation history/));

    expect(await screen.findByText(/Prepared evidence attempt 1/)).toBeVisible();
    expect(screen.queryByText(/The model read the first/)).not.toBeInTheDocument();
  });

  it("names the Story the operator created, not the publisher's page title", async () => {
    const { inbox, stories } = clients();
    renderInbox(inbox, stories);

    fireEvent.click(await screen.findByRole("button", { name: "Create new Story" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Story title/ }), {
      target: { value: "An operator's own headline" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Source relevance/ }), {
      target: { value: "Relevant evidence." },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Editorial decision reason/ }), {
      target: { value: "Worth pursuing." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create, attach, and record decision" }));

    expect(await screen.findByText("Story created and Source attached.")).toBeVisible();
    expect(screen.getByText(story.title)).toBeVisible();
    expect(screen.queryByText("Extracted title")).not.toBeInTheDocument();
  });

  it("offers extraction retry when no successful extraction exists", async () => {
    const { inbox, stories } = clients();
    const unextracted: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [unextractedItem],
      })),
    };
    renderInbox(unextracted, stories);

    expect(
      await screen.findByText("No successful extraction is available to prepare."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try extraction again" }));
    expect(unextracted.retryExtraction).toHaveBeenCalledWith(source.id);
  });

  it("prepares the recovered evidence after a successful extraction retry", async () => {
    const { inbox, stories } = clients();
    const unextracted: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [unextractedItem],
      })),
    };
    renderInbox(unextracted, stories);

    fireEvent.click(await screen.findByRole("button", { name: "Try extraction again" }));

    await waitFor(() =>
      expect(unextracted.prepareEvidence).toHaveBeenCalledWith(source.id, retriedExtraction.id),
    );
  });

  it("reports a repeated extraction failure without discarding the Source", async () => {
    const { inbox, stories } = clients();
    const unextracted: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [unextractedItem],
      })),
      retryExtraction: vi.fn<SourceInboxClient["retryExtraction"]>(async () => ({
        kind: "completed",
        value: failedExtraction,
      })),
    };
    renderInbox(unextracted, stories);

    fireEvent.click(await screen.findByRole("button", { name: "Try extraction again" }));

    expect(
      await screen.findByText("Extraction failed again: RESPONSE_REJECTED · retryable: no"),
    ).toBeVisible();
    expect(unextracted.prepareEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Create new Story" })).toBeVisible();
  });

  it("keeps the latest successful evidence primary when a later attempt failed", async () => {
    const { inbox, stories } = clients();
    const failedPreparation = {
      id: sourceEvidencePreparationId("preparation-26"),
      sourceId: source.id,
      extractionId: extraction.id,
      model: { provider: "openrouter", model: "operator/model" },
      preparer: { key: "storyrail_evidence_preparer", version: "1" },
      input: { rawCharacters: 512, submittedCharacters: 512 },
      requestedBy: actor,
      startedAt: "failed-preparation-started",
      completedAt: "failed-preparation-completed",
      outcome: "failed",
      failure: { code: "MODEL_OUTPUT_INVALID", retryable: true },
    } satisfies SourceEvidencePreparation;
    const preparedInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ ...item, preparations: [preparation, failedPreparation] }],
      })),
    };
    renderInbox(preparedInbox, stories);

    expect(await screen.findByRole("heading", { name: "Prepared evidence" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Latest preparation attempt failed" }),
    ).toBeVisible();
    expect(screen.getByText(/latest successful Prepared Evidence remains primary/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare again" })).toBeVisible();
    const history = screen.getByText("Preparation history").closest("details");
    fireEvent.click(screen.getByText("Preparation history"));
    expect(within(history as HTMLElement).getByText("Prepared evidence attempt 1")).toBeVisible();
    expect(within(history as HTMLElement).getByText("Prepared evidence attempt 2")).toBeVisible();
  });

  it("does not offer preparation for a failed raw extraction", async () => {
    const { inbox, stories } = clients();
    const failedExtraction: SourceExtraction = {
      id: sourceExtractionId("failed-extraction-25"),
      sourceId: source.id,
      extractor: { key: "controlled", version: "1" },
      requestedBy: actor,
      startedAt: "failed-start",
      completedAt: "failed-complete",
      outcome: "failed",
      failure: { code: "RETRIEVAL_FAILED", retryable: true },
    };
    const failedInbox: SourceInboxClient = {
      ...inbox,
      listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
        kind: "completed",
        value: [{ source, extractions: [failedExtraction], preparations: [] }],
      })),
    };
    renderInbox(failedInbox, stories);
    expect(
      await screen.findByText("No successful extraction is available to prepare."),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Prepare evidence" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Raw extraction history"));
    expect(screen.getByText("RETRIEVAL_FAILED · retryable: yes")).toBeVisible();
  });

  it("shows a completed new-Story handoff and opens the Story only on explicit request", async () => {
    const { inbox, stories } = clients();
    const onStoryLoaded = vi.fn<SourceInboxWorkspaceProps["onStoryLoaded"]>();
    const onPendingCountChange =
      vi.fn<NonNullable<SourceInboxWorkspaceProps["onPendingCountChange"]>>();
    renderInbox(inbox, stories, { onStoryLoaded, onPendingCountChange });
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(await screen.findByRole("button", { name: "Create new Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), { target: { value: "Relevant" } });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "New subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create, attach, and record decision" }));
    await waitFor(() => expect(stories.inspectStory).toHaveBeenCalledWith(story.id));
    expect(stories.createStory).toHaveBeenCalledWith("Extracted title");
    expect(stories.attachSource).toHaveBeenCalledWith(story.id, source.id, "Relevant");
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "new_story",
      story.id,
      "New subject",
    );
    expect(await screen.findByText("Story created and Source attached.")).toBeVisible();
    expect(onPendingCountChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("button", { name: "Open Story" })).toBeVisible();
    expect(onStoryLoaded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open Story" }));
    expect(onStoryLoaded).toHaveBeenCalledWith(
      expect.objectContaining({ story: expect.objectContaining({ id: story.id }) }),
    );
  });

  it("attaches to an existing Story without creating another Story", async () => {
    const { inbox, stories } = clients();
    const onPendingCountChange =
      vi.fn<NonNullable<SourceInboxWorkspaceProps["onPendingCountChange"]>>();
    renderInbox(inbox, stories, { onPendingCountChange });
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(await screen.findByRole("button", { name: "Attach to existing Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), {
      target: { value: "Additional facts" },
    });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "Same subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach and record decision" }));
    await waitFor(() => expect(inbox.recordTriageDecision).toHaveBeenCalled());
    expect(stories.createStory).not.toHaveBeenCalled();
    expect(stories.attachSource).toHaveBeenCalledWith(story.id, source.id, "Additional facts");
    expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
      source.id,
      "existing_story",
      story.id,
      "Same subject",
    );
    expect(await screen.findByText("Source attached to Story.")).toBeVisible();
    expect(onPendingCountChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("button", { name: "Open Story" })).toBeVisible();
  });

  it("records skip without mutating Stories", async () => {
    const { inbox, stories } = clients();
    const onPendingCountChange =
      vi.fn<NonNullable<SourceInboxWorkspaceProps["onPendingCountChange"]>>();
    renderInbox(inbox, stories, { onPendingCountChange });
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "No material facts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record skip decision" }));
    await waitFor(() =>
      expect(inbox.recordTriageDecision).toHaveBeenCalledWith(
        source.id,
        "skip",
        null,
        "No material facts",
      ),
    );
    expect(stories.createStory).not.toHaveBeenCalled();
    expect(stories.attachSource).not.toHaveBeenCalled();
    expect(stories.inspectStory).not.toHaveBeenCalled();
    expect(await screen.findByText(/Skip decision recorded/)).toBeVisible();
    expect(onPendingCountChange).toHaveBeenLastCalledWith(0);
    expect(screen.getByRole("button", { name: "Continue triage" })).toBeVisible();
  });

  it("keeps pending and failed decisions counted", async () => {
    const { inbox, stories } = clients();
    let finishDecision:
      | ((result: Awaited<ReturnType<SourceInboxClient["recordTriageDecision"]>>) => void)
      | undefined;
    const controlledInbox: SourceInboxClient = {
      ...inbox,
      recordTriageDecision: vi.fn<SourceInboxClient["recordTriageDecision"]>(
        () =>
          new Promise((resolve) => {
            finishDecision = resolve;
          }),
      ),
    };
    const onPendingCountChange =
      vi.fn<NonNullable<SourceInboxWorkspaceProps["onPendingCountChange"]>>();
    renderInbox(controlledInbox, stories, { onPendingCountChange });
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "No material facts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record skip decision" }));
    expect(await screen.findByText("Recording skip decision…")).toBeVisible();
    expect(onPendingCountChange).toHaveBeenLastCalledWith(1);
    finishDecision?.({ kind: "unavailable", message: SOURCE_INBOX_UNAVAILABLE_MESSAGE });
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(onPendingCountChange).toHaveBeenLastCalledWith(1);
  });

  it("replaces local completion tracking with authoritative refresh data", async () => {
    const { inbox, stories } = clients();
    const onPendingCountChange =
      vi.fn<NonNullable<SourceInboxWorkspaceProps["onPendingCountChange"]>>();
    const props = {
      stories: [{ story, sourceCount: 0 }],
      inboxRequests: inbox,
      storyRequests: stories,
      onPendingCountChange,
      onStoryKnown: vi.fn(),
      onStoryLoaded: vi.fn(),
    };
    const view = render(<SourceInboxWorkspace refreshVersion={0} {...props} />);
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "No material facts" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Record skip decision" }));
    expect(await screen.findByText(/Skip decision recorded/)).toBeVisible();
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(0));

    view.rerender(<SourceInboxWorkspace refreshVersion={1} {...props} />);
    await waitFor(() => expect(inbox.listPendingSources).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onPendingCountChange).toHaveBeenLastCalledWith(1));
    expect(screen.getByRole("button", { name: "Skip" })).toBeVisible();
  });

  it("preserves a known count of one when new Story inspection fails", async () => {
    const { inbox, stories } = clients();
    const failedStories: StoryClient = {
      ...stories,
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: "The Story request could not be completed.",
      })),
    };
    const onStoryKnown = vi.fn<SourceInboxWorkspaceProps["onStoryKnown"]>();
    renderInbox(inbox, failedStories, { onStoryKnown });

    fireEvent.click(await screen.findByRole("button", { name: "Create new Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), { target: { value: "Relevant" } });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "New subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create, attach, and record decision" }));

    expect(
      await screen.findByText(/authoritative Story inspection could not be loaded/i),
    ).toBeVisible();
    expect(onStoryKnown).toHaveBeenLastCalledWith(story, 1);
  });

  it("preserves N plus one when existing Story inspection fails", async () => {
    const { inbox, stories } = clients();
    const failedStories: StoryClient = {
      ...stories,
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: "The Story request could not be completed.",
      })),
    };
    const onStoryKnown = vi.fn<SourceInboxWorkspaceProps["onStoryKnown"]>();
    renderInbox(inbox, failedStories, { sourceCount: 4, onStoryKnown });

    fireEvent.click(await screen.findByRole("button", { name: "Attach to existing Story" }));
    fireEvent.change(screen.getByLabelText("Source relevance"), {
      target: { value: "Additional facts" },
    });
    fireEvent.change(screen.getByLabelText("Editorial decision reason"), {
      target: { value: "Same subject" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Attach and record decision" }));

    expect(
      await screen.findByText(/authoritative Story inspection could not be loaded/i),
    ).toBeVisible();
    expect(onStoryKnown).toHaveBeenLastCalledWith(story, 5);
  });
});
