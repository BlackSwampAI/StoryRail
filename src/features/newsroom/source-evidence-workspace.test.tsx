import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

import {
  SOURCE_EVIDENCE_UNAVAILABLE_MESSAGE,
  type RequestSourceEvidenceUrl,
  type SourceEvidenceUrlResult,
} from "./source-evidence-url-client";
import { SourceEvidenceWorkspace } from "./source-evidence-workspace";

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
const COMPLETED = Object.freeze({
  kind: "completed",
  source: SOURCE,
  extraction: SUCCESSFUL_EXTRACTION,
} satisfies SourceEvidenceUrlResult);

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
    expect(screen.getByText(/not attached to a Story/i)).toBeVisible();
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
    expect(alert).toHaveTextContent("Source was not preserved because preservation conflicted");
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

  it("allows one later explicit submission, does not mutate results, and renders no Story action", async () => {
    const before = JSON.stringify(COMPLETED);
    const request = requestReturning();
    render(<SourceEvidenceWorkspace requestSourceEvidence={request} />);

    submit("first");
    await completedReceipt("Source preserved and extraction completed");
    submit("second");
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));

    expect(request.mock.calls).toEqual([["first"], ["second"]]);
    expect(JSON.stringify(COMPLETED)).toBe(before);
    expect(
      screen.queryByRole("button", { name: /create Story|attach Source/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /create Story|attach Source/i }),
    ).not.toBeInTheDocument();
  });
});
