import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  storyId,
  STORY_STATES,
  type SourceExtraction,
  type Story,
  type UrlSource,
} from "@/domain/editorial";

import { NewsroomShell } from "./newsroom-shell";
import { STORY_STATE_LABELS } from "./newsroom-state";
import type {
  RequestSourceEvidenceUrl,
  SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const ACTOR = Object.freeze({
  type: "operator",
  operatorId: operatorId("operator-newsroom-0022"),
} as const);
const INTAKE_STORY = Object.freeze({
  id: storyId("a-real-intake-story"),
  title: "A persisted intake Story",
  state: "intake",
  revisionCycle: 0,
  createdAt: "opaque-created-intake",
  updatedAt: "opaque-updated-intake",
} satisfies Story);
const REVIEW_STORY = Object.freeze({
  id: storyId("z-real-review-story"),
  title: "A persisted review Story",
  state: "in_review",
  revisionCycle: 1,
  createdAt: "opaque-created-review",
  updatedAt: "opaque-updated-review",
} satisfies Story);
const SOURCE_URL = "https://example.com/newsroom-source";
const canonicalization = canonicalizeSourceUrl(SOURCE_URL);
if (!canonicalization.ok) throw new Error("Controlled Source URL must be canonicalizable.");
const SOURCE = Object.freeze({
  id: sourceId("source-newsroom-0022"),
  type: "url",
  submittedUrl: SOURCE_URL,
  canonicalUrl: canonicalization.canonicalUrl,
  submittedBy: ACTOR,
  receivedAt: "opaque-source-received",
} satisfies UrlSource);
const ATTACHMENT = Object.freeze({
  storyId: INTAKE_STORY.id,
  sourceId: SOURCE.id,
  relevance: "Primary real evidence.",
  attachedBy: ACTOR,
  attachedAt: "opaque-source-attached",
});
const SUCCESSFUL_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-newsroom-0023-success"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "opaque-success-started",
  completedAt: "opaque-success-completed",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Persisted newsroom evidence\n\n<img src=x onerror=alert('unsafe')>\n\nFull text.",
    title: "Persisted extraction headline",
    byline: null,
    publishedAt: "opaque-publication-timestamp",
    language: "en",
  }),
} satisfies SourceExtraction);
const FAILED_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-newsroom-0023-failed"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "opaque-failure-started",
  completedAt: "opaque-failure-completed",
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
} satisfies SourceExtraction);
const INSPECTION = Object.freeze({
  story: INTAKE_STORY,
  sources: [{ attachment: ATTACHMENT, source: SOURCE, extractions: [SUCCESSFUL_EXTRACTION] }],
});

function completedClient(overrides: Partial<StoryClient> = {}): StoryClient {
  return {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [
        { story: INTAKE_STORY, sourceCount: 1 },
        { story: REVIEW_STORY, sourceCount: 0 },
      ],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: INTAKE_STORY,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "completed",
      value: ATTACHMENT,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: INSPECTION,
    })),
    ...overrides,
  };
}

function completedSourceRequest(): ReturnType<typeof vi.fn<RequestSourceEvidenceUrl>> {
  const result = Object.freeze({
    kind: "completed",
    source: SOURCE,
    extraction: SUCCESSFUL_EXTRACTION,
  } satisfies SourceEvidenceUrlResult);
  return vi.fn<RequestSourceEvidenceUrl>(async () => result);
}

function queueButton(state: (typeof STORY_STATES)[number], count: number) {
  return screen.getByRole("button", {
    name: `${STORY_STATE_LABELS[state]}, ${count} ${count === 1 ? "story" : "stories"}`,
  });
}

describe("NewsroomShell", () => {
  it("loads one persisted listing and derives all eight truthful queue counts", async () => {
    const listedItems = [
      { story: INTAKE_STORY, sourceCount: 1 },
      { story: REVIEW_STORY, sourceCount: 0 },
    ] as const;
    let resolveListing:
      ((value: Awaited<ReturnType<StoryClient["listStories"]>>) => void) | undefined;
    const listStories = vi.fn<StoryClient["listStories"]>(
      () =>
        new Promise((resolve) => {
          resolveListing = resolve;
        }),
    );
    const client = completedClient({ listStories });
    render(<NewsroomShell storyRequests={client} />);

    expect(screen.getByRole("status")).toHaveTextContent("Loading persisted Stories");
    expect(screen.getByRole("button", { name: "Intake, count unavailable" })).toHaveTextContent(
      "—",
    );
    expect(client.listStories).toHaveBeenCalledOnce();
    await act(async () => resolveListing?.({ kind: "completed", value: listedItems }));
    const navigation = screen.getByRole("navigation", { name: "Story state queues" });
    expect(within(navigation).getAllByRole("button")).toHaveLength(STORY_STATES.length);
    for (const state of STORY_STATES) {
      const count = state === "intake" || state === "in_review" ? 1 : 0;
      expect(queueButton(state, count)).toBeVisible();
    }
    expect(screen.getByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveTextContent(
      "1 source",
    );
    expect(screen.queryByText(/Unassigned|No activity|Waiting for editor/)).not.toBeInTheDocument();
  });

  it("shows real empty queues without treating loading or failure as zero", async () => {
    const client = completedClient();
    const first = render(<NewsroomShell storyRequests={client} />);
    await screen.findByRole("button", { name: "Published, 0 stories" });
    fireEvent.click(queueButton("published", 0));
    expect(screen.getByRole("status")).toHaveTextContent("No Stories in published");
    first.unmount();

    const unavailable = completedClient({
      listStories: vi.fn<StoryClient["listStories"]>(async () => ({
        kind: "unavailable",
        message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
      })),
    });
    render(<NewsroomShell storyRequests={unavailable} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Persisted Stories are unavailable");
    expect(screen.getByRole("button", { name: "Intake, count unavailable" })).toBeVisible();
    expect(unavailable.listStories).toHaveBeenCalledOnce();
  });

  it("loads authoritative inspection only when a persisted Story card is clicked", async () => {
    let resolveInspection:
      ((value: Awaited<ReturnType<StoryClient["inspectStory"]>>) => void) | undefined;
    const inspectStory = vi.fn<StoryClient["inspectStory"]>(
      () =>
        new Promise((resolve) => {
          resolveInspection = resolve;
        }),
    );
    const client = completedClient({ inspectStory });
    render(<NewsroomShell storyRequests={client} />);
    const card = await screen.findByRole("button", { name: new RegExp(INTAKE_STORY.title) });
    expect(inspectStory).not.toHaveBeenCalled();
    fireEvent.click(card);
    expect(screen.getByRole("status")).toHaveTextContent("Loading authoritative Story");
    expect(inspectStory).toHaveBeenCalledWith(INTAKE_STORY.id);
    await act(async () => resolveInspection?.({ kind: "completed", value: INSPECTION }));

    expect(await screen.findByText("Persisted Story")).toBeVisible();
    expect(screen.getByRole("heading", { name: INTAKE_STORY.title })).toBeVisible();
    expect(screen.getByText(ATTACHMENT.relevance)).toBeVisible();
    expect(screen.getByRole("heading", { name: "Extraction attempt 1" })).toBeVisible();
    expect(screen.getByText(SUCCESSFUL_EXTRACTION.document.title)).toBeVisible();
    expect(screen.getByText(SUCCESSFUL_EXTRACTION.document.publishedAt)).toBeVisible();
    expect(screen.getByText(SUCCESSFUL_EXTRACTION.document.language)).toBeVisible();
    expect(screen.getByText("Unavailable")).toBeVisible();
    const markdown = screen.getByText(/# Persisted newsroom evidence/).closest("pre");
    expect(markdown?.textContent).toBe(SUCCESSFUL_EXTRACTION.document.content);
    expect(markdown?.innerHTML).toContain("&lt;img");
  });

  it("renders every append-ordered attempt and truthful failed and empty evidence states", async () => {
    const emptySource = Object.freeze({
      ...SOURCE,
      id: sourceId("source-newsroom-0023-empty"),
      canonicalUrl: "https://example.com/empty-evidence" as UrlSource["canonicalUrl"],
    });
    const emptyAttachment = Object.freeze({
      ...ATTACHMENT,
      sourceId: emptySource.id,
      relevance: "A Source without extraction history.",
    });
    const inspection = {
      story: INTAKE_STORY,
      sources: [
        {
          attachment: ATTACHMENT,
          source: SOURCE,
          extractions: [FAILED_EXTRACTION, SUCCESSFUL_EXTRACTION],
        },
        { attachment: emptyAttachment, source: emptySource, extractions: [] },
      ],
    };
    const client = completedClient({
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "completed",
        value: inspection,
      })),
    });
    render(<NewsroomShell storyRequests={client} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(INTAKE_STORY.title) }));

    const attempts = await screen.findAllByRole("heading", { name: /Extraction attempt/ });
    expect(attempts.map((heading) => heading.textContent)).toEqual([
      "Extraction attempt 1",
      "Extraction attempt 2",
    ]);
    expect(screen.getByRole("heading", { name: "Extraction failed" })).toBeVisible();
    expect(screen.getByText("RETRIEVAL_FAILED")).toBeVisible();
    expect(screen.getByText("Yes")).toBeVisible();
    expect(screen.getByText("No extraction is recorded for this Source.")).toBeVisible();
    expect(client.inspectStory).toHaveBeenCalledOnce();
  });

  it("restores persisted Markdown from a fresh Story inspection after a workspace remount", async () => {
    const client = completedClient();
    const first = render(<NewsroomShell storyRequests={client} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(INTAKE_STORY.title) }));
    expect(await screen.findByText(/# Persisted newsroom evidence/)).toBeVisible();
    first.unmount();

    render(<NewsroomShell storyRequests={client} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(INTAKE_STORY.title) }));
    expect(await screen.findByText(/# Persisted newsroom evidence/)).toBeVisible();
    expect(client.inspectStory).toHaveBeenCalledTimes(2);
  });

  it("shows a safe inspection unavailable state without listing-only fallback", async () => {
    const client = completedClient({
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
      })),
    });
    render(<NewsroomShell storyRequests={client} />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(INTAKE_STORY.title) }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Story inspection unavailable");
    expect(screen.queryByText("Persisted Story")).not.toBeInTheDocument();
  });

  it("adds the authoritative newly created Story to Intake immediately without mutating inputs", async () => {
    const requestSource = completedSourceRequest();
    const originalItems = Object.freeze([{ story: REVIEW_STORY, sourceCount: 0 }]);
    const client = completedClient({
      listStories: vi.fn<StoryClient["listStories"]>(async () => ({
        kind: "completed",
        value: originalItems,
      })),
    });
    const before = JSON.stringify(originalItems);
    render(<NewsroomShell requestSourceEvidence={requestSource} storyRequests={client} />);
    await screen.findByRole("button", { name: "Intake, 0 stories" });

    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: SOURCE_URL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Story title" }), {
      target: { value: INTAKE_STORY.title },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    expect(await screen.findByText("Persisted Story")).toBeVisible();
    expect(queueButton("intake", 1)).toBeVisible();
    expect(screen.getByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveTextContent(
      "1 source",
    );
    expect(client.listStories).toHaveBeenCalledOnce();
    expect(JSON.stringify(originalItems)).toBe(before);
  });

  it("keeps Intake unchanged when local relevance validation prevents creation", async () => {
    const client = completedClient({
      listStories: vi.fn<StoryClient["listStories"]>(async () => ({
        kind: "completed",
        value: [],
      })),
    });
    render(
      <NewsroomShell requestSourceEvidence={completedSourceRequest()} storyRequests={client} />,
    );
    await screen.findByRole("button", { name: "Intake, 0 stories" });
    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: SOURCE_URL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Explain why this Source is relevant to the Story.",
    );
    expect(queueButton("intake", 0)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: new RegExp(INTAKE_STORY.title) }),
    ).not.toBeInTheDocument();
    expect(client.createStory).not.toHaveBeenCalled();
    expect(client.attachSource).not.toHaveBeenCalled();
    expect(client.inspectStory).not.toHaveBeenCalled();
  });

  it("updates one partial-progress card after explicit attachment recovery", async () => {
    const correctedRelevance = "Corrected newsroom relevance.";
    const attachSource = vi
      .fn<StoryClient["attachSource"]>()
      .mockResolvedValueOnce({
        kind: "application-failure",
        error: {
          code: "STORY_SOURCE_RELEVANCE_REQUIRED",
          message: "A non-empty relevance is required to attach a Source to a Story.",
        },
      })
      .mockResolvedValueOnce({ kind: "completed", value: ATTACHMENT });
    const client = completedClient({
      listStories: vi.fn<StoryClient["listStories"]>(async () => ({
        kind: "completed",
        value: [],
      })),
      attachSource,
    });
    render(
      <NewsroomShell requestSourceEvidence={completedSourceRequest()} storyRequests={client} />,
    );
    await screen.findByRole("button", { name: "Intake, 0 stories" });
    fireEvent.click(screen.getByRole("button", { name: "Source intake" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
      target: { value: SOURCE_URL },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Story title" }), {
      target: { value: INTAKE_STORY.title },
    });
    const relevance = screen.getByRole("textbox", { name: "Why is this Source relevant?" });
    fireEvent.change(relevance, { target: { value: ATTACHMENT.relevance } });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    const retry = await screen.findByRole("button", { name: "Retry Source attachment" });
    expect(queueButton("intake", 1)).toBeVisible();
    expect(screen.getAllByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveLength(1);
    expect(screen.getByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveTextContent(
      "0 sources",
    );
    fireEvent.change(relevance, { target: { value: correctedRelevance } });
    fireEvent.click(retry);

    expect(await screen.findByText("Persisted Story")).toBeVisible();
    expect(screen.getAllByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveLength(1);
    expect(screen.getByRole("button", { name: new RegExp(INTAKE_STORY.title) })).toHaveTextContent(
      "1 source",
    );
    expect(client.createStory).toHaveBeenCalledOnce();
    expect(attachSource).toHaveBeenCalledTimes(2);
    expect(attachSource).toHaveBeenLastCalledWith(INTAKE_STORY.id, SOURCE.id, correctedRelevance);
    expect(client.inspectStory).toHaveBeenCalledOnce();
  });
});
