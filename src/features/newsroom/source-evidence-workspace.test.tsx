import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceEvidencePreparationId,
  sourceExtractionId,
  sourceId,
  type SourceEvidencePreparation,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import type { SourceInboxClient, SourceInboxClientResult } from "./source-inbox-client";
import type {
  RequestSourceEvidenceUrl,
  SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";

const canonical = canonicalizeSourceUrl("https://example.com/report");
if (!canonical.ok) throw new Error("Fixture URL must be valid.");
const ACTOR = { type: "operator", operatorId: operatorId("operator-24") } as const;
const SOURCE = {
  id: sourceId("source-24"),
  type: "url",
  submittedUrl: "https://example.com/report?utm_source=desk",
  canonicalUrl: canonical.canonicalUrl,
  submittedBy: ACTOR,
  receivedAt: "2026-08-10T12:00:00.000Z",
} satisfies UrlSource;
const EXTRACTION = {
  id: sourceExtractionId("extraction-24"),
  sourceId: SOURCE.id,
  extractor: { key: "controlled", version: "1" },
  requestedBy: ACTOR,
  startedAt: "2026-08-10T12:00:01.000Z",
  completedAt: "2026-08-10T12:00:02.000Z",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Exact persisted evidence",
    title: "Evidence title",
    byline: "Raw Reporter",
    publishedAt: "2026-08-09T09:00:00.000Z",
    language: "en",
  },
} satisfies SourceExtraction;
const PREPARATION = {
  id: sourceEvidencePreparationId("preparation-24"),
  sourceId: SOURCE.id,
  extractionId: EXTRACTION.id,
  model: { provider: "openrouter", model: "example/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  requestedBy: ACTOR,
  startedAt: "2026-08-10T12:00:03.000Z",
  completedAt: "2026-08-10T12:00:04.000Z",
  outcome: "succeeded",
  document: {
    format: "markdown",
    content: "# Prepared heading\n\nReadable **evidence** with [source](https://example.com).",
    title: "Prepared title",
    byline: "Prepared Reporter",
    publishedAt: "2026-08-09T09:00:00.000Z",
    language: "en",
  },
} satisfies SourceEvidencePreparation;
const FAILED_PREPARATION = {
  id: sourceEvidencePreparationId("preparation-failed"),
  sourceId: SOURCE.id,
  extractionId: EXTRACTION.id,
  model: { provider: "openrouter", model: "example/model" },
  preparer: { key: "storyrail_evidence_preparer", version: "1" },
  requestedBy: ACTOR,
  startedAt: "2026-08-10T12:00:03.000Z",
  completedAt: "2026-08-10T12:00:04.000Z",
  outcome: "failed",
  failure: { code: "MODEL_OUTPUT_INVALID", retryable: true },
} satisfies SourceEvidencePreparation;
const COMPLETED = {
  kind: "completed",
  source: SOURCE,
  extraction: EXTRACTION,
} satisfies SourceEvidenceUrlResult;

function request(result: SourceEvidenceUrlResult = COMPLETED) {
  return vi.fn<RequestSourceEvidenceUrl>(async () => result);
}

function inbox(
  prepareResult: SourceInboxClientResult<SourceEvidencePreparation> = {
    kind: "completed",
    value: PREPARATION,
  },
): SourceInboxClient {
  return {
    listPendingSources: vi.fn<SourceInboxClient["listPendingSources"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    recordTriageDecision: vi.fn<SourceInboxClient["recordTriageDecision"]>(async () => ({
      kind: "unavailable",
      message: "The Source Inbox request could not be completed.",
    })),
    prepareEvidence: vi.fn<SourceInboxClient["prepareEvidence"]>(async () => prepareResult),
  };
}

function submit() {
  fireEvent.change(screen.getByRole("textbox", { name: "Source URL" }), {
    target: { value: "  exact caller URL  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "Bring into newsroom" }));
}

describe("SourceEvidenceWorkspace", () => {
  it("composes preserve/extract and preparation once, then makes Prepared Evidence primary", async () => {
    const perform = request();
    const inboxRequests = inbox();
    const onSourceAvailable = vi.fn();
    const onReviewInInbox = vi.fn();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={perform}
        inboxRequests={inboxRequests}
        onSourceAvailable={onSourceAvailable}
        onReviewInInbox={onReviewInInbox}
      />,
    );
    submit();

    expect(await screen.findByRole("heading", { name: "Prepared Evidence" })).toBeVisible();
    expect(perform).toHaveBeenCalledOnce();
    expect(perform).toHaveBeenCalledWith("  exact caller URL  ");
    expect(inboxRequests.prepareEvidence).toHaveBeenCalledOnce();
    expect(inboxRequests.prepareEvidence).toHaveBeenCalledWith(SOURCE.id, EXTRACTION.id);
    expect(screen.getByRole("heading", { name: "Prepared title" })).toBeVisible();
    expect(screen.getByText("evidence")).toHaveProperty("tagName", "STRONG");
    expect(screen.getByRole("link", { name: "source" })).toHaveAttribute(
      "href",
      "https://example.com/",
    );
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add another Source" })).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "Source URL" })).not.toBeInTheDocument();
    expect(onSourceAvailable).toHaveBeenCalledWith(SOURCE.id);
    expect(inboxRequests.recordTriageDecision).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review in Source Inbox" }));
    expect(onReviewInInbox).toHaveBeenCalledWith(SOURCE.id);
  });

  it("announces the real preserve/extract and preparation request boundaries", async () => {
    let resolveIntake!: (result: SourceEvidenceUrlResult) => void;
    let resolvePreparation!: (result: SourceInboxClientResult<SourceEvidencePreparation>) => void;
    const perform = vi.fn<RequestSourceEvidenceUrl>(
      () =>
        new Promise((resolve) => {
          resolveIntake = resolve;
        }),
    );
    const inboxRequests = inbox();
    inboxRequests.prepareEvidence = vi.fn<SourceInboxClient["prepareEvidence"]>(
      () =>
        new Promise((resolve) => {
          resolvePreparation = resolve;
        }),
    );
    render(
      <SourceEvidenceWorkspace requestSourceEvidence={perform} inboxRequests={inboxRequests} />,
    );
    submit();

    expect(screen.getByText("Preserving and extracting Source…")).toBeVisible();
    await act(async () => resolveIntake(COMPLETED));
    const activeHeading = await screen.findByRole("heading", { name: "Preparing evidence…" });
    const activeStatus = activeHeading.closest("article");
    expect(activeStatus).toHaveAttribute("aria-busy", "true");
    expect(
      within(activeStatus as HTMLElement).getByText(/This can take a few seconds/),
    ).toBeVisible();
    const completedStages = within(activeStatus as HTMLElement)
      .getAllByRole("listitem")
      .filter((item) => item.dataset.stage === "completed");
    expect(completedStages).toHaveLength(2);
    expect(completedStages[0]).toHaveTextContent("Source preserved");
    expect(completedStages[1]).toHaveTextContent("Article extracted");
    const activeStage = within(activeStatus as HTMLElement)
      .getAllByRole("listitem")
      .find((item) => item.dataset.stage === "active");
    expect(activeStage).toHaveTextContent("Preparing evidence…");
    expect(activeStage).not.toHaveAttribute("data-stage", "completed");
    expect(screen.getByTestId("preparation-activity")).toHaveAttribute("aria-hidden", "true");
    expect(
      screen.queryByRole("button", { name: "Review in Source Inbox" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add another Source" })).not.toBeInTheDocument();
    await act(async () => resolvePreparation({ kind: "completed", value: PREPARATION }));
    expect(await screen.findByRole("heading", { name: "Prepared Evidence" })).toBeVisible();
    expect(screen.queryByTestId("preparation-activity")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add another Source" })).toBeVisible();
  });

  it("preserves Source and extraction truth when a durable preparation fails", async () => {
    const inboxRequests = inbox({ kind: "completed", value: FAILED_PREPARATION });
    render(
      <SourceEvidenceWorkspace requestSourceEvidence={request()} inboxRequests={inboxRequests} />,
    );
    submit();

    expect(
      await screen.findByRole("heading", { name: "Evidence preparation failed" }),
    ).toBeVisible();
    expect(screen.getAllByText("Source preserved").length).toBeGreaterThan(0);
    expect(screen.getByText("Article extracted")).toBeVisible();
    const latestFailure = screen
      .getByRole("heading", { name: "Latest preparation attempt failed" })
      .closest("div");
    expect(within(latestFailure as HTMLElement).getByText(/MODEL_OUTPUT_INVALID/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Prepare again" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add another Source" })).toBeVisible();
    expect(screen.queryByTestId("preparation-activity")).not.toBeInTheDocument();
    expect(inboxRequests.prepareEvidence).toHaveBeenCalledOnce();
  });

  it("distinguishes an unavailable preparation request from a durable failed preparation", async () => {
    const inboxRequests = inbox({
      kind: "unavailable",
      message: "The Source Inbox request could not be completed.",
    });
    render(
      <SourceEvidenceWorkspace requestSourceEvidence={request()} inboxRequests={inboxRequests} />,
    );
    submit();

    expect(
      await screen.findByRole("heading", {
        name: "StoryRail could not request evidence preparation",
      }),
    ).toBeVisible();
    expect(screen.getByText(/Source and extraction are safe/)).toBeVisible();
    expect(screen.getByText("No durable preparation record is available.")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "Retry preparation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
  });

  it("keeps Source and extraction acknowledged after a preparation application failure", async () => {
    const inboxRequests = inbox({
      kind: "application-failure",
      error: { code: "SOURCE_EXTRACTION_NOT_PREPARABLE", message: "Cannot prepare." },
    });
    render(
      <SourceEvidenceWorkspace requestSourceEvidence={request()} inboxRequests={inboxRequests} />,
    );
    submit();

    expect(
      await screen.findByRole("heading", {
        name: "StoryRail could not request evidence preparation",
      }),
    ).toBeVisible();
    expect(screen.getByText(/SOURCE_EXTRACTION_NOT_PREPARABLE/)).toBeVisible();
    expect(screen.getByText(/Source and extraction are safe/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry preparation" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
  });

  it("does not prepare after a durable extraction failure", async () => {
    const failedExtraction: SourceExtraction = {
      id: sourceExtractionId("failed-extraction-24"),
      sourceId: SOURCE.id,
      extractor: { key: "controlled", version: "1" },
      requestedBy: ACTOR,
      startedAt: "2026-08-10T12:00:01.000Z",
      completedAt: "2026-08-10T12:00:02.000Z",
      outcome: "failed",
      failure: { code: "RETRIEVAL_FAILED", retryable: true },
    };
    const inboxRequests = inbox();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={request({
          kind: "completed",
          source: SOURCE,
          extraction: failedExtraction,
        })}
        inboxRequests={inboxRequests}
      />,
    );
    submit();

    expect(await screen.findByRole("heading", { name: "Extraction failed" })).toBeVisible();
    expect(screen.getByText("Evidence preparation not attempted")).toBeVisible();
    const extractionFailure = screen
      .getByRole("heading", { name: "Extraction failure recorded" })
      .closest("div");
    expect(within(extractionFailure as HTMLElement).getByText(/RETRIEVAL_FAILED/)).toBeVisible();
    expect(inboxRequests.prepareEvidence).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
  });

  it("keeps duplicate intake distinct and performs no preparation", async () => {
    const inboxRequests = inbox();
    const onSourceAvailable = vi.fn();
    render(
      <SourceEvidenceWorkspace
        onSourceAvailable={onSourceAvailable}
        inboxRequests={inboxRequests}
        requestSourceEvidence={request({
          kind: "preservation-conflict",
          error: {
            code: "DUPLICATE_SOURCE",
            message: "Already exists.",
            existingSourceId: SOURCE.id,
            canonicalUrl: SOURCE.canonicalUrl,
          },
        })}
      />,
    );
    submit();

    expect(await screen.findByRole("heading", { name: "Source already exists" })).toBeVisible();
    expect(screen.getByText(/No new extraction or preparation was created/)).toBeVisible();
    expect(inboxRequests.prepareEvidence).not.toHaveBeenCalled();
    expect(onSourceAvailable).toHaveBeenCalledWith(SOURCE.id);
    expect(screen.getByRole("button", { name: "Review in Source Inbox" })).toBeVisible();
  });

  it("prepares the same intake extraction again and retains both immutable attempts", async () => {
    const second = {
      ...PREPARATION,
      id: sourceEvidencePreparationId("preparation-25"),
      document: { ...PREPARATION.document, title: "Newest prepared title" },
    } satisfies SourceEvidencePreparation;
    const inboxRequests = inbox();
    vi.mocked(inboxRequests.prepareEvidence)
      .mockResolvedValueOnce({ kind: "completed", value: PREPARATION })
      .mockResolvedValueOnce({ kind: "completed", value: second });
    render(
      <SourceEvidenceWorkspace requestSourceEvidence={request()} inboxRequests={inboxRequests} />,
    );
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "Prepare again" }));

    expect(await screen.findByRole("heading", { name: "Newest prepared title" })).toBeVisible();
    expect(inboxRequests.prepareEvidence).toHaveBeenNthCalledWith(2, SOURCE.id, EXTRACTION.id);
    const history = screen.getByText("Preparation history · 2 attempts").closest("details");
    expect(history).not.toHaveAttribute("open");
    fireEvent.click(within(history as HTMLElement).getByText("Preparation history · 2 attempts"));
    await waitFor(() =>
      expect(within(history as HTMLElement).getAllByText("Succeeded")).toHaveLength(2),
    );
  });

  it("returns to a clean intake form when the operator chooses Add another Source", async () => {
    render(<SourceEvidenceWorkspace requestSourceEvidence={request()} inboxRequests={inbox()} />);
    submit();
    fireEvent.click(await screen.findByRole("button", { name: "Add another Source" }));
    expect(screen.getByRole("textbox", { name: "Source URL" })).toHaveValue("");
    expect(
      screen.queryByRole("button", { name: "Review in Source Inbox" }),
    ).not.toBeInTheDocument();
  });
});
