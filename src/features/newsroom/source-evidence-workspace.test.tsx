import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  storyId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import {
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";
import { STORY_REQUEST_UNAVAILABLE_MESSAGE, type StoryClient } from "./story-client";

const SUBMITTED_URL = "  https://Example.com/report?utm_source=desk  ";
const canonicalization = canonicalizeSourceUrl("https://example.com/report");

if (!canonicalization.ok) {
  throw new Error("The workspace fixture URL must be canonicalizable.");
}

const ACTOR = Object.freeze({ type: "operator", operatorId: operatorId("operator-0016") } as const);
const SOURCE = Object.freeze({
  id: sourceId("source-0016"),
  type: "url",
  submittedUrl: SUBMITTED_URL,
  canonicalUrl: canonicalization.canonicalUrl,
  submittedBy: ACTOR,
  receivedAt: "2026-08-09T19:00:00.000Z",
} satisfies UrlSource);
const SUCCESSFUL_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-0016"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "2026-08-09T19:00:01.000Z",
  completedAt: "2026-08-09T19:00:02.000Z",
  outcome: "succeeded",
  document: Object.freeze({
    format: "markdown",
    content: "# Evidence\n\n<img src=x onerror=alert('unsafe')>\n\nComplete content.",
    title: "Evidence title",
    byline: null,
    publishedAt: null,
    language: null,
  }),
} satisfies SourceExtraction);
const FAILED_EXTRACTION = Object.freeze({
  id: sourceExtractionId("extraction-failed-0021"),
  sourceId: SOURCE.id,
  extractor: Object.freeze({ key: "controlled", version: "1" }),
  requestedBy: ACTOR,
  startedAt: "2026-08-09T19:00:01.000Z",
  completedAt: "2026-08-09T19:00:02.000Z",
  outcome: "failed",
  failure: Object.freeze({ code: "RETRIEVAL_FAILED", retryable: true }),
} satisfies SourceExtraction);
const COMPLETED = Object.freeze({
  kind: "completed",
  source: SOURCE,
  extraction: SUCCESSFUL_EXTRACTION,
} satisfies SourceEvidenceUrlResult);
const CREATED_STORY = Object.freeze({
  id: storyId("story-0021"),
  title: "Operator Story title",
  state: "intake",
  revisionCycle: 0,
  createdAt: "2026-08-09T21:00:00.000Z",
  updatedAt: "2026-08-09T21:00:00.000Z",
} as const);
const ATTACHMENT = Object.freeze({
  storyId: CREATED_STORY.id,
  sourceId: SOURCE.id,
  relevance: "The Source documents the event.",
  attachedBy: ACTOR,
  attachedAt: "2026-08-09T21:01:00.000Z",
} as const);

function successfulStoryRequests(overrides: Partial<StoryClient> = {}): StoryClient {
  return {
    listStories: vi.fn<StoryClient["listStories"]>(async () => ({
      kind: "completed",
      value: [],
    })),
    createStory: vi.fn<StoryClient["createStory"]>(async () => ({
      kind: "completed",
      value: CREATED_STORY,
    })),
    attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "completed",
      value: ATTACHMENT,
    })),
    inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
      kind: "completed",
      value: {
        story: CREATED_STORY,
        sources: [{ attachment: ATTACHMENT, source: SOURCE, extractions: [SUCCESSFUL_EXTRACTION] }],
      },
    })),
    ...overrides,
  };
}

function requestReturning(result: SourceEvidenceUrlResult = COMPLETED) {
  return vi.fn<RequestSourceEvidenceUrl>(async () => result);
}

function submit(value?: string) {
  const input = screen.getByRole("textbox", { name: "Source URL" });
  if (value !== undefined) fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
}

async function completedReceipt(name: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { name });
  const receipt = heading.closest("article");

  if (!receipt) {
    throw new Error("Expected the completed receipt heading to belong to an article.");
  }

  return receipt;
}

describe("SourceEvidenceWorkspace", () => {
  it("renders an accessible browser-unvalidated form and performs no request on render", () => {
    const request = requestReturning();
    const { container } = render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

    const input = screen.getByRole("textbox", { name: "Source URL" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).not.toHaveAttribute("required");
    expect(screen.getByRole("button", { name: "Preserve and extract" })).toBeEnabled();
    expect(container.querySelector('[aria-live="polite"]')).toBeInTheDocument();
    expect(screen.getByText(/remains distinct from a Story/i)).toBeVisible();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([SUBMITTED_URL, "", "   ", "not a repaired URL"])(
    "passes the exact input unchanged for %j",
    async (value) => {
      const request = requestReturning();
      render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

      submit(value);

      await waitFor(() => expect(request).toHaveBeenCalledOnce());
      expect(request).toHaveBeenCalledWith(value);
    },
  );

  it("announces pending work, disables submission, and prevents concurrent submission", async () => {
    let resolveRequest: ((result: SourceEvidenceUrlResult) => void) | undefined;
    const request = vi.fn<RequestSourceEvidenceUrl>(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

    submit(SUBMITTED_URL);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preserving the Source and attempting extraction",
    );
    expect(
      screen.getByRole("region", { name: "Preserve one URL as Source evidence" }),
    ).toHaveAttribute("aria-busy", "true");
    const button = screen.getByRole("button", { name: "Preserve and extract" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(request).toHaveBeenCalledOnce();

    await act(async () => resolveRequest?.(COMPLETED));
    expect(button).toBeEnabled();
  });

  it("displays every completed Source, extraction, document, actor, and timestamp fact", async () => {
    render(<SourceEvidenceWorkspace requestSourceEvidence={requestReturning()} />);
    submit(SUBMITTED_URL);

    const receipt = await completedReceipt("Source preserved and extraction completed");
    expect(receipt).toHaveTextContent("Source preserved and extraction completed");
    for (const fact of [
      SOURCE.id,
      SOURCE.type,
      SOURCE.canonicalUrl,
      ACTOR.operatorId,
      SOURCE.receivedAt,
      SUCCESSFUL_EXTRACTION.id,
      SUCCESSFUL_EXTRACTION.sourceId,
      SUCCESSFUL_EXTRACTION.extractor.key,
      SUCCESSFUL_EXTRACTION.extractor.version,
      SUCCESSFUL_EXTRACTION.startedAt,
      SUCCESSFUL_EXTRACTION.completedAt,
      SUCCESSFUL_EXTRACTION.outcome,
      SUCCESSFUL_EXTRACTION.document.format,
      SUCCESSFUL_EXTRACTION.document.title,
    ]) {
      expect(receipt).toHaveTextContent(fact);
    }
    const submittedUrlFact = within(receipt).getByText("Exact submitted URL").closest("div");
    expect(submittedUrlFact?.querySelector("dd")?.textContent).toBe(SOURCE.submittedUrl);
    expect(within(receipt).getAllByText("Unavailable")).toHaveLength(3);
    const content = receipt.querySelector("pre");
    expect(content?.textContent).toBe(SUCCESSFUL_EXTRACTION.document.content);
    expect(content?.innerHTML).toContain("&lt;img");
    expect(within(receipt).queryByRole("img")).not.toBeInTheDocument();
  });

  it("presents a durable provider failure as a completed receipt without retrying", async () => {
    const failedExtraction = Object.freeze({
      id: sourceExtractionId("extraction-failed-0016"),
      sourceId: SOURCE.id,
      extractor: Object.freeze({ key: "controlled", version: "1" }),
      requestedBy: ACTOR,
      startedAt: "2026-08-09T19:00:01.000Z",
      completedAt: "2026-08-09T19:00:02.000Z",
      outcome: "failed",
      failure: Object.freeze({ code: "RETRIEVAL_TIMED_OUT", retryable: true }),
    } satisfies SourceExtraction);
    const result = Object.freeze({
      kind: "completed",
      source: SOURCE,
      extraction: failedExtraction,
    } satisfies SourceEvidenceUrlResult);
    const request = requestReturning(result);
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

    submit(SUBMITTED_URL);

    const receipt = await completedReceipt("Source preserved; extraction failure recorded");
    expect(receipt).toHaveTextContent("Source preserved; extraction failure recorded");
    expect(receipt).toHaveTextContent("RETRIEVAL_TIMED_OUT");
    expect(receipt).toHaveTextContent(/Retryable\s*Yes/);
    expect(receipt).not.toHaveTextContent("Partial completion");
    expect(receipt).toHaveTextContent(SOURCE.id);
    expect(request).toHaveBeenCalledOnce();
  });

  it("shows validation failure without a preserved Source receipt", async () => {
    const request = requestReturning({
      kind: "preservation-validation-failure",
      error: { code: "SOURCE_URL_TOO_LONG", message: "Too long.", maximumLength: 2048 },
    });
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);
    submit("");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Source was not preserved because URL validation failed");
    expect(alert).toHaveTextContent(/SOURCE_URL_TOO_LONG/);
    expect(alert).toHaveTextContent(/Maximum length\s*2048/);
    expect(
      within(alert).queryByRole("heading", { name: "Preserved Source" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "duplicate",
      {
        code: "DUPLICATE_SOURCE" as const,
        message: "Already preserved.",
        existingSourceId: sourceId("source-existing"),
        canonicalUrl: canonicalization.canonicalUrl,
      },
      "source-existing",
    ],
    [
      "Source identity conflict",
      {
        code: "SOURCE_ID_CONFLICT" as const,
        message: "Identity conflict.",
        sourceId: SOURCE.id,
      },
      SOURCE.id,
    ],
  ] as const)("shows %s preservation facts", async (_label, error, expectedIdentity) => {
    const request = requestReturning({ kind: "preservation-conflict", error });
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);
    submit(SUBMITTED_URL);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      error.code === "DUPLICATE_SOURCE"
        ? "Source already exists and can be reused"
        : "Source was not preserved because preservation conflicted",
    );
    expect(alert).toHaveTextContent(expectedIdentity);
    if (error.code === "DUPLICATE_SOURCE") {
      expect(alert).toHaveTextContent(error.canonicalUrl);
    }
  });

  it("shows extraction-stage partial completion with the preserved Source and error facts", async () => {
    const request = requestReturning({
      kind: "partial-completion",
      stage: "extraction",
      source: SOURCE,
      error: {
        code: "SOURCE_EXTRACTION_ID_CONFLICT",
        message: "Extraction identity conflict.",
        extractionId: sourceExtractionId("extraction-conflict"),
      },
    });
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);
    submit(SUBMITTED_URL);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Source preserved; extraction could not complete");
    expect(alert).toHaveTextContent(/Stage\s*extraction/);
    expect(alert).toHaveTextContent(SOURCE.id);
    expect(alert).toHaveTextContent("SOURCE_EXTRACTION_ID_CONFLICT");
    expect(alert).not.toHaveTextContent("rolled back");
  });

  it.each([
    [
      "interface rejection",
      {
        kind: "interface-rejection" as const,
        error: { code: "INVALID_REQUEST", message: "Controlled request rejected." },
      },
      "The Source evidence interface rejected the request",
    ],
    [
      "generic internal failure",
      {
        kind: "internal-failure" as const,
        error: { code: "INTERNAL_SERVER_ERROR", message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE },
      },
      "The Source evidence operation failed",
    ],
  ] as const)("keeps %s distinct", async (_label, result, heading) => {
    render(<SourceEvidenceWorkspace requestSourceEvidence={requestReturning(result)} />);
    submit(SUBMITTED_URL);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(heading);
    expect(alert).toHaveTextContent(result.error.code);
  });

  it("shows only the safe unavailable message when the dependency is unavailable", async () => {
    const secret = "postgres://operator:secret@example.internal/storyrail";
    const request = vi.fn<RequestSourceEvidenceUrl>(async () => {
      throw new Error(secret);
    });
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);
    submit(SUBMITTED_URL);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE);
    expect(alert).not.toHaveTextContent(secret);
    expect(alert).not.toHaveTextContent("postgres");
    expect(request).toHaveBeenCalledOnce();
  });

  it("allows one later explicit Source submission without mutating results", async () => {
    const before = JSON.stringify(COMPLETED);
    const request = requestReturning();
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

    submit("first");
    await completedReceipt("Source preserved and extraction completed");
    submit("second");
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    expect(request.mock.calls).toEqual([["first"], ["second"]]);
    expect(JSON.stringify(COMPLETED)).toBe(before);
    expect(screen.getByRole("button", { name: "Create Story from Source" })).toBeVisible();
  });

  it.each([
    ["completed Source", COMPLETED, true],
    [
      "failed durable extraction",
      {
        kind: "completed" as const,
        source: SOURCE,
        extraction: FAILED_EXTRACTION,
      },
      true,
    ],
    [
      "extraction partial completion",
      {
        kind: "partial-completion" as const,
        stage: "extraction" as const,
        source: SOURCE,
        error: { code: "SOURCE_NOT_FOUND" as const, message: "Missing.", sourceId: SOURCE.id },
      },
      true,
    ],
    [
      "duplicate Source",
      {
        kind: "preservation-conflict" as const,
        error: {
          code: "DUPLICATE_SOURCE" as const,
          message: "Exists.",
          existingSourceId: sourceId("source-existing"),
          canonicalUrl: SOURCE.canonicalUrl,
        },
      },
      true,
    ],
    [
      "Source ID conflict",
      {
        kind: "preservation-conflict" as const,
        error: { code: "SOURCE_ID_CONFLICT" as const, message: "Conflict.", sourceId: SOURCE.id },
      },
      false,
    ],
    [
      "validation failure",
      {
        kind: "preservation-validation-failure" as const,
        error: { code: "SOURCE_URL_REQUIRED" as const, message: "Required." },
      },
      false,
    ],
    [
      "interface failure",
      {
        kind: "interface-rejection" as const,
        error: { code: "INVALID_REQUEST", message: "Invalid." },
      },
      false,
    ],
    [
      "internal failure",
      {
        kind: "internal-failure" as const,
        error: { code: "INTERNAL_SERVER_ERROR", message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE },
      },
      false,
    ],
    [
      "unavailable failure",
      { kind: "unavailable" as const, message: SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE },
      false,
    ],
  ] as const)(
    "%s exposes the Story action only when a durable Source identity exists",
    async (_label, result, expected) => {
      render(<SourceEvidenceWorkspace requestSourceEvidence={requestReturning(result)} />);
      submit(SUBMITTED_URL);
      await waitFor(() =>
        expect(screen.queryByRole("button", { name: "Create Story from Source" }) !== null).toBe(
          expected,
        ),
      );
    },
  );

  it("uses a duplicate's existing Source identity and does not invent a title", async () => {
    const existingSourceId = sourceId("source-existing");
    const requests = successfulStoryRequests();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning({
          kind: "preservation-conflict",
          error: {
            code: "DUPLICATE_SOURCE",
            message: "Exists.",
            existingSourceId,
            canonicalUrl: SOURCE.canonicalUrl,
          },
        })}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);

    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    const title = await screen.findByRole("textbox", { name: "Story title" });
    expect(title).toHaveValue("");
    fireEvent.change(title, { target: { value: CREATED_STORY.title } });
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    await waitFor(() => expect(requests.attachSource).toHaveBeenCalledOnce());
    expect(requests.attachSource).toHaveBeenCalledWith(
      CREATED_STORY.id,
      existingSourceId,
      ATTACHMENT.relevance,
    );
  });

  it("prefills an editable extracted title and uses only operator-entered title and relevance", async () => {
    const requests = successfulStoryRequests();
    const onStoryLoaded = vi.fn();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
        onStoryLoaded={onStoryLoaded}
      />,
    );
    submit(SUBMITTED_URL);

    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    const title = await screen.findByRole("textbox", { name: "Story title" });
    expect(title).toHaveValue("Evidence title");
    fireEvent.change(title, { target: { value: CREATED_STORY.title } });
    const relevance = screen.getByRole("textbox", { name: "Why is this Source relevant?" });
    expect(relevance).toHaveValue("");
    fireEvent.change(relevance, { target: { value: ATTACHMENT.relevance } });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    await waitFor(() => expect(onStoryLoaded).toHaveBeenCalledOnce());
    expect(requests.createStory).toHaveBeenCalledWith(CREATED_STORY.title);
    expect(requests.attachSource).toHaveBeenCalledWith(
      CREATED_STORY.id,
      SOURCE.id,
      ATTACHMENT.relevance,
    );
    expect(requests.inspectStory).toHaveBeenCalledWith(CREATED_STORY.id);
    expect(requests.createStory).toHaveBeenCalledOnce();
    expect(requests.attachSource).toHaveBeenCalledOnce();
    expect(requests.inspectStory).toHaveBeenCalledOnce();
  });

  it.each(["", "   "])(
    "prevents durable Story calls for missing relevance %j and leaves the form editable",
    async (missingRelevance) => {
      const requests = successfulStoryRequests();
      render(
        <SourceEvidenceWorkspace
          requestSourceEvidence={requestReturning()}
          storyRequests={requests}
        />,
      );
      submit(SUBMITTED_URL);
      fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
      const relevance = screen.getByRole("textbox", { name: "Why is this Source relevant?" });
      fireEvent.change(relevance, { target: { value: missingRelevance } });
      fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

      expect(relevance).toBeEnabled();
      expect(relevance).toHaveAttribute("aria-invalid", "true");
      expect(relevance).toHaveAttribute("aria-describedby", "source-relevance-error");
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Explain why this Source is relevant to the Story.",
      );
      expect(requests.createStory).not.toHaveBeenCalled();
      expect(requests.attachSource).not.toHaveBeenCalled();
      expect(requests.inspectStory).not.toHaveBeenCalled();

      fireEvent.change(relevance, { target: { value: ATTACHMENT.relevance } });
      expect(relevance).not.toHaveAttribute("aria-invalid");
      expect(
        screen.queryByText("Explain why this Source is relevant to the Story."),
      ).not.toBeInTheDocument();
    },
  );

  it.each(["", "   "])(
    "prevents durable calls for missing title %j and associates an editable error",
    async (missingTitle) => {
      const requests = successfulStoryRequests();
      render(
        <SourceEvidenceWorkspace
          requestSourceEvidence={requestReturning()}
          storyRequests={requests}
        />,
      );
      submit(SUBMITTED_URL);
      fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
      const title = screen.getByRole("textbox", { name: "Story title" });
      fireEvent.change(title, { target: { value: missingTitle } });
      fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
        target: { value: ATTACHMENT.relevance },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

      expect(title).toBeEnabled();
      expect(title).toHaveAttribute("aria-invalid", "true");
      expect(title).toHaveAttribute("aria-describedby", "story-title-error");
      expect(screen.getByRole("alert")).toHaveTextContent("Enter a non-empty Story title.");
      expect(requests.createStory).not.toHaveBeenCalled();
      expect(requests.attachSource).not.toHaveBeenCalled();
      expect(requests.inspectStory).not.toHaveBeenCalled();
    },
  );

  it("retries a known relevance failure against the existing Story and then inspects it", async () => {
    const correctedRelevance = "Corrected Source relevance.";
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
    const requests = successfulStoryRequests({ attachSource });
    const onStoryCreated = vi.fn();
    const onStoryLoaded = vi.fn();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
        onStoryCreated={onStoryCreated}
        onStoryLoaded={onStoryLoaded}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    const relevance = screen.getByRole("textbox", { name: "Why is this Source relevant?" });
    fireEvent.change(relevance, { target: { value: ATTACHMENT.relevance } });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    const retry = await screen.findByRole("button", { name: "Retry Source attachment" });
    expect(screen.getByText("Story created; Source not attached").closest("div")).toHaveTextContent(
      CREATED_STORY.id,
    );
    expect(relevance).toBeEnabled();
    fireEvent.change(relevance, { target: { value: correctedRelevance } });
    fireEvent.click(retry);

    await waitFor(() => expect(onStoryLoaded).toHaveBeenCalledOnce());
    expect(onStoryCreated).toHaveBeenCalledOnce();
    expect(onStoryCreated).toHaveBeenCalledWith(CREATED_STORY);
    expect(requests.createStory).toHaveBeenCalledOnce();
    expect(attachSource).toHaveBeenNthCalledWith(
      1,
      CREATED_STORY.id,
      SOURCE.id,
      ATTACHMENT.relevance,
    );
    expect(attachSource).toHaveBeenNthCalledWith(
      2,
      CREATED_STORY.id,
      SOURCE.id,
      correctedRelevance,
    );
    expect(requests.inspectStory).toHaveBeenCalledOnce();
    expect(requests.inspectStory).toHaveBeenCalledWith(CREATED_STORY.id);
  });

  it("does not offer or perform attachment retry after an ambiguous unavailable result", async () => {
    const attachSource = vi.fn<StoryClient["attachSource"]>(async () => ({
      kind: "unavailable",
      message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
    }));
    const requests = successfulStoryRequests({ attachSource });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    const partial = await screen.findByText("Story created; Source attachment status unavailable");
    expect(partial.closest("div")).toHaveTextContent("not rolled back or deleted");
    expect(
      screen.queryByRole("button", { name: "Retry Source attachment" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Story already created" })).toBeDisabled();
    expect(attachSource).toHaveBeenCalledOnce();
    expect(requests.inspectStory).not.toHaveBeenCalled();
  });

  it("does not offer attachment retry when the attachment request throws", async () => {
    const attachSource = vi.fn<StoryClient["attachSource"]>(async () => {
      throw new Error("controlled network ambiguity");
    });
    const requests = successfulStoryRequests({ attachSource });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Story" }));

    expect(
      await screen.findByText("Story created; Source attachment status unavailable"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Retry Source attachment" }),
    ).not.toBeInTheDocument();
    expect(attachSource).toHaveBeenCalledOnce();
    expect(requests.inspectStory).not.toHaveBeenCalled();
  });

  it("prevents concurrent Story submissions while showing truthful progress", async () => {
    let resolveCreate:
      ((result: Awaited<ReturnType<StoryClient["createStory"]>>) => void) | undefined;
    const requests = successfulStoryRequests({
      createStory: vi.fn<StoryClient["createStory"]>(
        () =>
          new Promise<Awaited<ReturnType<StoryClient["createStory"]>>>((resolve) => {
            resolveCreate = resolve;
          }),
      ),
    });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    const button = await screen.findByRole("button", { name: "Create Story" });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    const storyForm = button.closest("form");
    if (!storyForm) throw new Error("Expected the Story submit control inside a form.");
    expect(within(storyForm).getByRole("status")).toHaveTextContent("Creating Story");
    fireEvent.click(button);
    expect(requests.createStory).toHaveBeenCalledOnce();
    await act(async () => resolveCreate?.({ kind: "completed", value: CREATED_STORY }));
  });

  it("stops after create failure and reports that no Story was created", async () => {
    const requests = successfulStoryRequests({
      createStory: vi.fn<StoryClient["createStory"]>(async () => ({
        kind: "application-failure",
        error: { code: "STORY_TITLE_REQUIRED", message: "A title is required." },
      })),
    });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Create Story" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Story was not created");
    expect(requests.attachSource).not.toHaveBeenCalled();
    expect(requests.inspectStory).not.toHaveBeenCalled();
  });

  it("preserves the created Story identity when attachment fails and does not inspect", async () => {
    const requests = successfulStoryRequests({
      attachSource: vi.fn<StoryClient["attachSource"]>(async () => ({
        kind: "application-failure",
        error: { code: "SOURCE_NOT_FOUND", message: "Source not found." },
      })),
    });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Create Story" }));

    const alert = await screen.findByText("Story created; Source not attached");
    expect(alert.closest("div")).toHaveTextContent(CREATED_STORY.id);
    expect(alert.closest("div")).toHaveTextContent("not rolled back or deleted");
    expect(requests.inspectStory).not.toHaveBeenCalled();
  });

  it("does not claim rollback when authoritative inspection cannot load", async () => {
    const requests = successfulStoryRequests({
      inspectStory: vi.fn<StoryClient["inspectStory"]>(async () => ({
        kind: "unavailable",
        message: STORY_REQUEST_UNAVAILABLE_MESSAGE,
      })),
    });
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={requestReturning()}
        storyRequests={requests}
      />,
    );
    submit(SUBMITTED_URL);
    fireEvent.click(await screen.findByRole("button", { name: "Create Story from Source" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Why is this Source relevant?" }), {
      target: { value: ATTACHMENT.relevance },
    });
    fireEvent.click(await screen.findByRole("button", { name: "Create Story" }));

    const heading = await screen.findByText(
      "Story and Source attachment completed; Story could not be loaded",
    );
    expect(heading.closest("div")).toHaveTextContent("were not rolled back");
  });
});
