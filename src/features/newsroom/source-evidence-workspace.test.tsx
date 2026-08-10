import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  canonicalizeSourceUrl,
  operatorId,
  sourceExtractionId,
  sourceId,
  type SourceExtraction,
  type UrlSource,
} from "@/domain/editorial";

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
    byline: null,
    publishedAt: null,
    language: null,
  },
} satisfies SourceExtraction;
const COMPLETED = {
  kind: "completed",
  source: SOURCE,
  extraction: EXTRACTION,
} satisfies SourceEvidenceUrlResult;

function request(result: SourceEvidenceUrlResult = COMPLETED) {
  return vi.fn<RequestSourceEvidenceUrl>(async () => result);
}

describe("SourceEvidenceWorkspace", () => {
  it("preserves the exact URL, renders durable receipts, and directs the operator to Source Inbox", async () => {
    const perform = request();
    const onSourceAvailable = vi.fn();
    render(
      <SourceEvidenceWorkspace
        requestSourceEvidence={perform}
        onSourceAvailable={onSourceAvailable}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Source URL" });
    fireEvent.change(input, { target: { value: "  exact caller URL  " } });
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));

    expect(await screen.findByText("# Exact persisted evidence")).toBeVisible();
    expect(perform).toHaveBeenCalledWith("  exact caller URL  ");
    expect(screen.getByText(/available for editorial review in Source Inbox/i)).toBeVisible();
    expect(onSourceAvailable).toHaveBeenCalledOnce();
    expect(screen.queryByText("Create Story from Source")).not.toBeInTheDocument();
  });

  it("refreshes authoritative inbox state for a duplicate without inventing a local pending item", async () => {
    const onSourceAvailable = vi.fn();
    render(
      <SourceEvidenceWorkspace
        onSourceAvailable={onSourceAvailable}
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
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    expect(await screen.findByText(/Source already exists/i)).toBeVisible();
    expect(onSourceAvailable).toHaveBeenCalledOnce();
  });

  it("does not refresh the inbox for validation failure", async () => {
    const onSourceAvailable = vi.fn();
    render(
      <SourceEvidenceWorkspace
        onSourceAvailable={onSourceAvailable}
        requestSourceEvidence={request({
          kind: "preservation-validation-failure",
          error: { code: "SOURCE_URL_REQUIRED", message: "Required." },
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Preserve and extract" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(onSourceAvailable).not.toHaveBeenCalled();
  });
});
