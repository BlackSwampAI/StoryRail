import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LedgerEntry, RevisionStep } from "@/application/editorial-ledger";
import { agentRunId, articleRevisionId, operatorId } from "@/domain/editorial";

import { EditorialLedger, formatDuration } from "./editorial-ledger-panel";

const OPERATOR = { type: "operator" as const, operatorId: operatorId("chris-local") };

const entries: readonly LedgerEntry[] = [
  {
    at: "2026-01-01T00:00:01.000Z",
    kind: "transition",
    title: "intake → assigned",
    detail: "Assigned by autopilot from the Assignment Editor suggestion.",
    actor: OPERATOR,
  },
  {
    at: "2026-01-01T00:00:09.000Z",
    kind: "run",
    title: "Writer drafted the Article",
    detail: null,
    actor: OPERATOR,
    outcome: "failed",
    model: { provider: "openrouter", model: "google/gemini-3.7-flash" },
    tookMs: 6200,
    failure: {
      code: "MODEL_OUTPUT_UNGROUNDED",
      retryable: true,
      findings: [
        {
          blockIndex: 5,
          citationIndex: 0,
          code: "CITATION_QUOTE_UNSUPPORTED",
          quote: "A passage the source never contained",
          evidenceId: "prepared-a",
        },
      ],
    },
  },
  {
    at: "2026-01-01T00:00:20.000Z",
    kind: "run",
    title: "Director reviewed the Article",
    detail: null,
    actor: OPERATOR,
    outcome: "failed",
    tookMs: null,
    failure: { code: "MODEL_OUTPUT_UNGROUNDED", retryable: true, unsupportedChecks: ["headline"] },
  },
];

const revisions: readonly RevisionStep[] = [
  {
    revision: {
      id: articleRevisionId("revision-1"),
      revisionNumber: 1,
      headline: "The first attempt",
      agentRunId: agentRunId("run-1"),
    } as never,
    measurement: {
      claimBlocks: 0,
      contextBlocks: 2,
      headingBlocks: 0,
      citations: 0,
      groundedShare: 0,
      derivedShare: 0,
    },
    requestedBecause: null,
    directorInstruction: null,
  },
  {
    revision: {
      id: articleRevisionId("revision-2"),
      revisionNumber: 2,
      headline: "The rewrite",
      agentRunId: agentRunId("run-2"),
    } as never,
    measurement: {
      claimBlocks: 4,
      contextBlocks: 0,
      headingBlocks: 1,
      citations: 4,
      groundedShare: 1,
      derivedShare: 0.05,
    },
    requestedBecause: "Adopted the Director recommendation under autopilot.",
    directorInstruction: "Attribute every claim to the evidence.",
  },
];

describe("the Story's working record", () => {
  it("shows a refused run's reason where a person will look, not only in the database", () => {
    render(<EditorialLedger entries={entries} revisions={[]} />);

    const refused = screen.getAllByText("MODEL_OUTPUT_UNGROUNDED");
    expect(refused).toHaveLength(2);
    expect(screen.getByText("A passage the source never contained")).toBeInTheDocument();
    expect(screen.getByText(/not found in the cited evidence/)).toBeInTheDocument();
    expect(screen.getByText(/Checks quoting the Article wrongly: headline/)).toBeInTheDocument();
  });

  it("reports the model and how long each run took", () => {
    render(<EditorialLedger entries={entries} revisions={[]} />);
    expect(screen.getByText(/google\/gemini-3\.7-flash · 6\.2s/)).toBeInTheDocument();
  });

  it("keeps the order it was given", () => {
    render(<EditorialLedger entries={entries} revisions={[]} />);
    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("intake → assigned")).toBeInTheDocument();
  });

  it("shows what each Revision changed and what was asked of it", () => {
    render(<EditorialLedger entries={[]} revisions={revisions} />);

    // The comparison that matters here is whether the rewrite became better grounded.
    expect(screen.getByText(/0% attributed · 0% carried over · 0 citations/)).toBeInTheDocument();
    expect(screen.getByText(/100% attributed · 5% carried over · 4 citations/)).toBeInTheDocument();
    expect(screen.getByText(/Attribute every claim to the evidence\./)).toBeInTheDocument();
  });

  it("says plainly when nothing has happened", () => {
    render(<EditorialLedger entries={[]} revisions={[]} />);
    expect(screen.getByText("Nothing has happened to this Story yet.")).toBeInTheDocument();
    expect(screen.getByText("No Article has been drafted yet.")).toBeInTheDocument();
  });

  it("reports short runs in milliseconds and unfinished ones not at all", () => {
    expect(formatDuration(420)).toBe("420ms");
    expect(formatDuration(6200)).toBe("6.2s");
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
  });
});
