import { describe, expect, it } from "vitest";

import {
  MAXIMUM_STANDARDS_CHARACTERS,
  newsroomStandardsId,
  operatorId,
  recordNewsroomStandards,
  standardsInForceAt,
  withNewsroomStandards,
  type NewsroomStandards,
} from ".";

const OPERATOR = { type: "operator" as const, operatorId: operatorId("chris-local") };
const standards = (overrides: Partial<NewsroomStandards> = {}): NewsroomStandards =>
  ({
    id: newsroomStandardsId("standards-1"),
    revisionNumber: 1,
    text: "Headlines are sentence case.",
    updatedBy: OPERATOR,
    updatedAt: "2026-08-23T10:00:00.000Z",
    ...overrides,
  }) as NewsroomStandards;

describe("a newsroom's editorial standards", () => {
  it("records a revision, trimmed", () => {
    expect(recordNewsroomStandards(standards({ text: "  Be plain.  " }))).toMatchObject({
      ok: true,
      standards: { text: "Be plain." },
    });
  });

  it("refuses standards that say nothing, or too much", () => {
    expect(recordNewsroomStandards(standards({ text: "   " }))).toMatchObject({
      ok: false,
      error: { code: "NEWSROOM_STANDARDS_TEXT_INVALID" },
    });
    // Long enough for a real style guide, short enough not to crowd out the evidence.
    expect(
      recordNewsroomStandards(standards({ text: "x".repeat(MAXIMUM_STANDARDS_CHARACTERS + 1) })),
    ).toMatchObject({ ok: false, error: { code: "NEWSROOM_STANDARDS_TEXT_INVALID" } });
  });

  it("numbers revisions from one", () => {
    expect(recordNewsroomStandards(standards({ revisionNumber: 0 }))).toMatchObject({
      ok: false,
      error: { code: "NEWSROOM_STANDARDS_REVISION_INVALID" },
    });
  });
});

describe("adding standards to a role's prompt", () => {
  const role = "You are StoryRail's supervised Writer. Use only supplied evidence.";

  it("leaves a prompt alone when no standards are set", () => {
    expect(withNewsroomStandards(role, null)).toBe(role);
    expect(withNewsroomStandards(role, "   ")).toBe(role);
  });

  it("places standards after the role's own rules and says what they may not do", () => {
    // A house style governs how work reads. It must not read as permission to claim more.
    const composed = withNewsroomStandards(role, "Headlines are sentence case.");

    expect(composed.startsWith(role)).toBe(true);
    expect(composed).toContain("Headlines are sentence case.");
    expect(composed).toContain("never relax the rules above about evidence, citation, tools");
  });
});

describe("which standards a run worked under", () => {
  const history = [
    standards({ revisionNumber: 1, updatedAt: "2026-08-01T00:00:00.000Z", text: "First." }),
    standards({ revisionNumber: 2, updatedAt: "2026-08-10T00:00:00.000Z", text: "Second." }),
  ];

  it("reads back the revision current when the run started", () => {
    // Derived rather than copied onto every run: both records already fix themselves in time.
    expect(standardsInForceAt(history, "2026-08-05T00:00:00.000Z")?.text).toBe("First.");
    expect(standardsInForceAt(history, "2026-08-20T00:00:00.000Z")?.text).toBe("Second.");
  });

  it("reports nothing for work that predates any standards", () => {
    expect(standardsInForceAt(history, "2026-07-01T00:00:00.000Z")).toBeNull();
    expect(standardsInForceAt([], "2026-08-20T00:00:00.000Z")).toBeNull();
  });
});
