import { describe, expect, it } from "vitest";

import {
  measureArticleGrounding,
  sourceEvidencePreparationId,
  sourceId,
  type ArticleBlock,
  type GroundingEvidence,
} from ".";

const SOURCE = sourceId("source-measure");
const EVIDENCE = sourceEvidencePreparationId("preparation-measure");

const source = (content: string): readonly GroundingEvidence[] => [
  { sourceId: SOURCE, evidenceId: EVIDENCE, content },
];
const cite = (quote: string) => [{ sourceId: SOURCE, evidenceId: EVIDENCE, quote }];

const RELEASE =
  "The release team announced version nine on Tuesday after a long stabilisation period. Adoption across the ecosystem is expected to take several months.";

describe("measuring how grounded an Article Revision is", () => {
  it("counts blocks and citations", () => {
    const measurement = measureArticleGrounding(
      [
        { kind: "heading", markdown: "What happened", citations: [] },
        { kind: "claim", markdown: "Version nine shipped.", citations: cite("version nine") },
        { kind: "context", markdown: "The wait was long.", citations: [] },
      ],
      source(RELEASE),
    );

    expect(measurement).toMatchObject({
      headingBlocks: 1,
      claimBlocks: 1,
      contextBlocks: 1,
      citations: 1,
    });
  });

  it("weighs grounding by length so splitting a claim cannot improve the score", () => {
    const long = "a".repeat(300);
    const one: readonly ArticleBlock[] = [
      { kind: "claim", markdown: long, citations: cite("version nine") },
      { kind: "context", markdown: "b".repeat(100), citations: [] },
    ];
    const split: readonly ArticleBlock[] = [
      { kind: "claim", markdown: "a".repeat(150), citations: cite("version nine") },
      { kind: "claim", markdown: "a".repeat(150), citations: cite("version nine") },
      { kind: "context", markdown: "b".repeat(100), citations: [] },
    ];

    expect(measureArticleGrounding(one, source(RELEASE)).groundedShare).toBeCloseTo(0.75, 5);
    expect(measureArticleGrounding(split, source(RELEASE)).groundedShare).toBeCloseTo(0.75, 5);
  });

  it("scores an Article that cites nothing as entirely ungrounded", () => {
    // Exactly what the Revisions carried forward from before citations existed should read as.
    expect(
      measureArticleGrounding(
        [{ kind: "context", markdown: "Fluent, confident, and unsupported.", citations: [] }],
        source(RELEASE),
      ).groundedShare,
    ).toBe(0);
  });

  it("ignores headings when weighing grounding", () => {
    expect(
      measureArticleGrounding(
        [
          { kind: "heading", markdown: "A".repeat(400), citations: [] },
          { kind: "claim", markdown: "Version nine shipped.", citations: cite("version nine") },
        ],
        source(RELEASE),
      ).groundedShare,
    ).toBe(1);
  });

  it("reports prose lifted from the source as derived", () => {
    // The article is the press release with the words in the same order. It is perfectly
    // grounded and says nothing of its own, and the measurement has to be able to say so.
    const restated: readonly ArticleBlock[] = [
      {
        kind: "claim",
        markdown: RELEASE,
        citations: cite("The release team announced version nine on Tuesday"),
      },
    ];

    const measurement = measureArticleGrounding(restated, source(RELEASE));
    expect(measurement.groundedShare).toBe(1);
    expect(measurement.derivedShare).toBe(1);
  });

  it("reports original reporting as underived even when it is grounded", () => {
    const reported: readonly ArticleBlock[] = [
      {
        kind: "claim",
        markdown:
          "Maintainers now have a firm date to plan migrations around, which had been the main obstacle raised in community threads all year.",
        citations: cite("The release team announced version nine on Tuesday"),
      },
    ];

    const measurement = measureArticleGrounding(reported, source(RELEASE));
    expect(measurement.groundedShare).toBe(1);
    expect(measurement.derivedShare).toBe(0);
  });

  it("looks past emphasis and code markers when comparing with the evidence", () => {
    const emphasised: readonly ArticleBlock[] = [
      {
        kind: "claim",
        markdown:
          "The **release team** announced `version nine` on Tuesday after a long stabilisation period.",
        citations: cite("The release team announced version nine on Tuesday"),
      },
    ];

    expect(measureArticleGrounding(emphasised, source(RELEASE)).derivedShare).toBe(1);
  });

  it("reports nothing to measure rather than guessing", () => {
    expect(measureArticleGrounding([], source(RELEASE))).toMatchObject({
      groundedShare: null,
      derivedShare: null,
    });
    expect(
      measureArticleGrounding(
        [{ kind: "heading", markdown: "Alone", citations: [] }],
        source(RELEASE),
      ).groundedShare,
    ).toBeNull();
  });
});
