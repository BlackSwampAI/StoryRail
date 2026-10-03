import { describe, expect, it } from "vitest";

import {
  MAXIMUM_STANDARDS_CHARACTERS,
  MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS,
  newsroomStandardsId,
  operatorId,
  recordNewsroomStandards,
  standardsInForceAt,
  withNewsroomStandards,
  type NewsroomStandards,
} from ".";

const OPERATOR = { type: "operator" as const, operatorId: operatorId("chris-local") };
const PUBLICATION_BRIEF = {
  audience: "Local residents",
  readerBenefit: "Understand the service change and what to do next.",
  coverageCriteria: "State what changed, when it takes effect, and who is affected.",
  voice: "Clear, calm, and useful.",
  avoid: "Speculation and promotional claims.",
};
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

  it("keeps legacy text-only revisions valid and records a bounded structured brief", () => {
    expect(recordNewsroomStandards(standards())).toMatchObject({ ok: true });
    expect(
      recordNewsroomStandards(
        standards({
          brief: Object.fromEntries(
            Object.entries(PUBLICATION_BRIEF).map(([key, value]) => [key, `  ${value}  `]),
          ) as typeof PUBLICATION_BRIEF,
        }),
      ),
    ).toMatchObject({
      ok: true,
      standards: {
        brief: {
          audience: PUBLICATION_BRIEF.audience,
          readerBenefit: PUBLICATION_BRIEF.readerBenefit,
          coverageCriteria: PUBLICATION_BRIEF.coverageCriteria,
          voice: PUBLICATION_BRIEF.voice,
          avoid: PUBLICATION_BRIEF.avoid,
        },
      },
    });
  });

  it("rejects incomplete or oversized publication brief fields", () => {
    expect(
      recordNewsroomStandards(standards({ brief: { ...PUBLICATION_BRIEF, audience: "  " } })),
    ).toMatchObject({ ok: false, error: { code: "NEWSROOM_STANDARDS_BRIEF_INVALID" } });
    expect(
      recordNewsroomStandards(
        standards({
          brief: {
            ...PUBLICATION_BRIEF,
            avoid: "x".repeat(MAXIMUM_PUBLICATION_BRIEF_FIELD_CHARACTERS + 1),
          },
        }),
      ),
    ).toMatchObject({ ok: false, error: { code: "NEWSROOM_STANDARDS_BRIEF_INVALID" } });
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

  it("says which newsroom the work is for, and that saying so licenses nothing", () => {
    // Telling an agent who the newsroom serves is context for judgement. An agent told that must
    // not conclude it may therefore assert things about those readers.
    const composed = withNewsroomStandards(role, null, {
      name: "Black Swamp AI",
      description: "Guides, Tips and News from the AI World",
    });

    expect(composed.startsWith(role)).toBe(true);
    expect(composed).toContain("Black Swamp AI");
    expect(composed).toContain("Guides, Tips and News from the AI World");
    expect(composed).toContain("never licence to assert anything the evidence does not support");
    expect(composed).toContain("never relaxes the rules above about evidence, citation, tools");
  });

  it("stays silent about a newsroom that has described itself as nothing", () => {
    // An empty heading reads like a newsroom that forgot to say who it is, which is worse than
    // saying nothing at all.
    expect(withNewsroomStandards(role, null, null)).toBe(role);
    expect(withNewsroomStandards(role, null, { name: "Black Swamp AI", description: "   " })).toBe(
      role,
    );
  });

  it("keeps who the newsroom is separate from how its work should read", () => {
    const composed = withNewsroomStandards(role, "Headlines are sentence case.", {
      name: "Black Swamp AI",
      description: "Guides, Tips and News from the AI World",
    });

    expect(composed).toContain("The newsroom you are working for, Black Swamp AI, publishes:");
    expect(composed).toContain("Editorial standards for this newsroom, set by the operator.");
    expect(composed.indexOf("Black Swamp AI")).toBeLessThan(
      composed.indexOf("Editorial standards for this newsroom"),
    );
  });

  it("adds a structured publication brief after the role rules while keeping evidence in control", () => {
    const composed = withNewsroomStandards(role, standards({ brief: PUBLICATION_BRIEF }));

    expect(composed.startsWith(role)).toBe(true);
    expect(composed).toContain("Audience: Local residents");
    expect(composed).toContain(
      "Reader benefit: Understand the service change and what to do next.",
    );
    expect(composed).toContain(
      "Coverage criteria: State what changed, when it takes effect, and who is affected.",
    );
    expect(composed).toContain("never overrides evidence, citation, or safety rules");
  });

  it("keeps different publication goals distinct instead of folding them into generic house style", () => {
    const localBrief = {
      audience: "Harbour district residents",
      readerBenefit: "Know what changed and what to do next.",
      coverageCriteria: "Local services and their effects on residents.",
      voice: "Direct and calm.",
      avoid: "Speculation about causes.",
    };
    const technicalBrief = {
      audience: "Working software engineers",
      readerBenefit: "Understand the documented compatibility impact.",
      coverageCriteria: "Verified release changes and migration steps.",
      voice: "Precise and practical.",
      avoid: "Unverified performance claims.",
    };
    const localPrompt = withNewsroomStandards(role, standards({ brief: localBrief }));
    const technicalPrompt = withNewsroomStandards(role, standards({ brief: technicalBrief }));

    expect(localPrompt).toContain("Audience: Harbour district residents");
    expect(localPrompt).toContain("Reader benefit: Know what changed and what to do next.");
    expect(localPrompt).not.toContain("Working software engineers");
    expect(technicalPrompt).toContain("Audience: Working software engineers");
    expect(technicalPrompt).toContain(
      "Reader benefit: Understand the documented compatibility impact.",
    );
    expect(technicalPrompt).not.toContain("Harbour district residents");
    for (const prompt of [localPrompt, technicalPrompt]) {
      expect(prompt).toContain("They never relax the rules above about evidence, citation, tools");
    }
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
