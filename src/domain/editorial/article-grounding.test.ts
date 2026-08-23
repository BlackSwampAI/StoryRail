import { describe, expect, it } from "vitest";

import {
  correctionStayedInScope,
  sourceEvidencePreparationId,
  sourceId,
  unsupportedDirectorQuotes,
  verifyArticleGrounding,
  type ArticleBlock,
  type GroundingEvidence,
} from ".";

const SOURCE = sourceId("source-grounding");
const EVIDENCE = sourceEvidencePreparationId("preparation-grounding");
const CONTENT =
  "Rust 2024 marks the largest edition released to date.\n\nThe `Future` and `IntoFuture` traits have been added to the standard library prelude.";

const evidence: readonly GroundingEvidence[] = [
  { sourceId: SOURCE, evidenceId: EVIDENCE, content: CONTENT },
];

const claim = (quote: string, overrides: Partial<ArticleBlock["citations"][number]> = {}) =>
  [
    {
      kind: "claim" as const,
      markdown: "The 2024 edition is the largest so far.",
      citations: [{ sourceId: SOURCE, evidenceId: EVIDENCE, quote, ...overrides }],
    },
  ] satisfies readonly ArticleBlock[];

describe("verifying that an Article Revision is grounded", () => {
  it("accepts a quote copied from the evidence", () => {
    expect(verifyArticleGrounding(claim("Rust 2024 marks the largest edition"), evidence)).toEqual({
      ok: true,
    });
  });

  it("accepts prose and headings that cite nothing", () => {
    expect(
      verifyArticleGrounding(
        [
          { kind: "heading", markdown: "What happened", citations: [] },
          { kind: "context", markdown: "The release lands as expected.", citations: [] },
        ],
        evidence,
      ),
    ).toEqual({ ok: true });
  });

  it("refuses a quote that does not appear in the evidence", () => {
    // The sentence is plausible, fluent, and absent from the source. This is the case the
    // whole batch exists for.
    expect(
      verifyArticleGrounding(claim("Rust 2024 was delayed by six months"), evidence),
    ).toMatchObject({
      ok: false,
      findings: [{ blockIndex: 0, citationIndex: 0, code: "CITATION_QUOTE_UNSUPPORTED" }],
    });
  });

  it("refuses a paraphrase presented as a quotation", () => {
    expect(
      verifyArticleGrounding(claim("Rust 2024 is the biggest edition so far"), evidence),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_QUOTE_UNSUPPORTED" }] });
  });

  it("refuses separated passages joined into one quotation", () => {
    expect(
      verifyArticleGrounding(
        claim("released to date. The `Future` and `IntoFuture` traits"),
        evidence,
      ),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_QUOTE_UNSUPPORTED" }] });
  });

  it("refuses a citation pointing at evidence this Assignment does not have", () => {
    expect(
      verifyArticleGrounding(
        claim("Rust 2024 marks the largest edition", {
          evidenceId: sourceEvidencePreparationId("preparation-elsewhere"),
        }),
        evidence,
      ),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_EVIDENCE_UNKNOWN" }] });
  });

  it("refuses a citation naming a Source that does not own the evidence", () => {
    expect(
      verifyArticleGrounding(
        claim("Rust 2024 marks the largest edition", { sourceId: sourceId("source-elsewhere") }),
        evidence,
      ),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_SOURCE_MISMATCH" }] });
  });

  it("looks past re-wrapping, curly quotation marks, and swapped dashes", () => {
    // A model that copies a passage accurately but re-renders its typography has still
    // copied it. Rejecting that would train the Writer to cite less, not more honestly.
    const typographic: readonly GroundingEvidence[] = [
      {
        sourceId: SOURCE,
        evidenceId: EVIDENCE,
        content: 'The team said "the edition is\n   ready" — shipping now.',
      },
    ];
    expect(
      verifyArticleGrounding(claim('the edition is ready" - shipping now'), typographic),
    ).toEqual({ ok: true });
  });

  it("looks past a line break written as the two characters backslash-n", () => {
    // Observed live: the model copied a wrapped passage accurately but escaped its newlines
    // twice. The words are right and only the rendering is wrong, so this is not fabrication.
    const wrapped: readonly GroundingEvidence[] = [
      {
        sourceId: SOURCE,
        evidenceId: EVIDENCE,
        content:
          "`cargo publish --workspace` is now supported, publishing all of\nthe crates in order.",
      },
    ];

    expect(
      verifyArticleGrounding(
        claim(
          "`cargo publish --workspace` is now supported, publishing all of\\nthe crates in order.",
        ),
        wrapped,
      ),
    ).toEqual({ ok: true });
    // Reworded text is still refused; only the rendering is forgiven.
    expect(
      verifyArticleGrounding(
        claim("`cargo publish --workspace` now publishes every crate"),
        wrapped,
      ),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_QUOTE_UNSUPPORTED" }] });
  });

  it("looks past a quotation mark written as the two characters backslash-quote", () => {
    // Observed live: the model copied a passage accurately and escaped its quotation marks
    // twice. As with escaped newlines, the words are right and only the rendering is wrong.
    const quoted: readonly GroundingEvidence[] = [
      {
        sourceId: SOURCE,
        evidenceId: EVIDENCE,
        content: 'The non-unwind ABIs (e.g., `"C"`) will now abort on uncaught unwinds.',
      },
    ];

    expect(
      verifyArticleGrounding(
        claim('The non-unwind ABIs (e.g., `\\"C\\"`) will now abort on uncaught unwinds.'),
        quoted,
      ),
    ).toEqual({ ok: true });
  });

  it("allows a lead-in and the list it introduces to be quoted together", () => {
    // The blank line before a Markdown list is punctuation, not a change of subject. Refusing
    // this was rejecting accurate quotations of real release notes.
    const listed: readonly GroundingEvidence[] = [
      {
        sourceId: SOURCE,
        evidenceId: EVIDENCE,
        content:
          "These previously stable APIs are now stable in const contexts:\n\n- `Cell::replace`\n- `Cell::get`\n\nUnrelated closing paragraph.",
      },
    ];

    expect(
      verifyArticleGrounding(
        claim("These previously stable APIs are now stable in const contexts: - `Cell::replace`"),
        listed,
      ),
    ).toEqual({ ok: true });
    // The boundary still holds where it means something: a genuinely separate paragraph.
    expect(
      verifyArticleGrounding(claim("`Cell::get` Unrelated closing paragraph."), listed),
    ).toMatchObject({ ok: false, findings: [{ code: "CITATION_QUOTE_UNSUPPORTED" }] });
  });

  it("reports every unsupported citation rather than only the first", () => {
    const result = verifyArticleGrounding(
      [
        ...claim("Not in the evidence at all"),
        {
          kind: "claim",
          markdown: "A second unsupported assertion.",
          citations: [
            { sourceId: SOURCE, evidenceId: EVIDENCE, quote: "Rust 2024 marks the largest" },
            { sourceId: SOURCE, evidenceId: EVIDENCE, quote: "Also absent" },
          ],
        },
      ],
      evidence,
    );

    expect(result).toMatchObject({
      ok: false,
      findings: [
        { blockIndex: 0, citationIndex: 0, code: "CITATION_QUOTE_UNSUPPORTED" },
        { blockIndex: 1, citationIndex: 1, code: "CITATION_QUOTE_UNSUPPORTED" },
      ],
    });
  });
});

describe("holding a Director to the standard it enforces", () => {
  const article =
    "Rust 2024 is the largest edition released to date.\n\nAdoption is expected to take months.";
  const check = (quoted: string) => ({ status: "pass" as const, note: "Fine.", quoted });

  it("accepts a review that quotes the Article it judged", () => {
    expect(
      unsupportedDirectorQuotes(
        {
          checks: {
            assignment: check("Rust 2024 is the largest edition"),
            style: check("Adoption is expected to take months."),
          },
        },
        article,
      ),
    ).toEqual([]);
  });

  it("names the checks that quote something the Article does not contain", () => {
    // A reviewer that can invent the passage it judged can refuse work over a sentence nobody
    // wrote, which is the same failure as a Writer inventing a source.
    expect(
      unsupportedDirectorQuotes(
        {
          checks: {
            assignment: check("Rust 2024 is the largest edition"),
            accuracy: check("The release was delayed"),
            style: check("Adoption is expected to take years."),
          },
        },
        article,
      ),
    ).toEqual(["accuracy", "style"]);
  });

  it("holds the Director to the same paragraph boundary as the Writer", () => {
    expect(
      unsupportedDirectorQuotes(
        { checks: { assignment: check("released to date. Adoption is expected") } },
        article,
      ),
    ).toEqual(["assignment"]);
  });
});

describe("keeping a correction to what it was asked to correct", () => {
  const cite = (quote: string) => [{ sourceId: SOURCE, evidenceId: EVIDENCE, quote }];
  const draft = (first: string, second: string): readonly ArticleBlock[] => [
    { kind: "claim", markdown: first, citations: cite("Rust 2024 marks") },
    { kind: "context", markdown: second, citations: [] },
  ];
  const finding = {
    blockIndex: 0,
    citationIndex: 0,
    code: "CITATION_QUOTE_UNSUPPORTED" as const,
    quote: "Rust 2024 marks",
    evidenceId: String(EVIDENCE),
  };

  it("accepts a correction that changed only the block it was told about", () => {
    const before = draft("A claim.", "Framing.");
    const after: readonly ArticleBlock[] = [
      { kind: "claim", markdown: "A claim.", citations: cite("Rust 2024 marks the largest") },
      before[1]!,
    ];

    expect(correctionStayedInScope(before, after, [finding])).toBe(true);
  });

  it("accepts a claim restated as the Writer's own framing", () => {
    // The escape hatch for a claim that cannot be supported: say it is your own, visibly.
    const before = draft("A claim.", "Framing.");
    const after: readonly ArticleBlock[] = [
      { kind: "context", markdown: "A claim.", citations: [] },
      before[1]!,
    ];

    expect(correctionStayedInScope(before, after, [finding])).toBe(true);
  });

  it("refuses a correction that rewrote a block nobody objected to", () => {
    // Telling the model not to is a prompt instruction. This is the invariant.
    const before = draft("A claim.", "Framing.");
    const after: readonly ArticleBlock[] = [
      before[0]!,
      { kind: "context", markdown: "Rewritten framing nobody asked for.", citations: [] },
    ];

    expect(correctionStayedInScope(before, after, [finding])).toBe(false);
  });

  it("refuses a correction that added or removed a block", () => {
    const before = draft("A claim.", "Framing.");
    expect(correctionStayedInScope(before, [before[0]!], [finding])).toBe(false);
    expect(
      correctionStayedInScope(
        before,
        [...before, { kind: "context", markdown: "A new thought.", citations: [] }],
        [finding],
      ),
    ).toBe(false);
  });

  it("refuses a citation quietly changed on a block that was not listed", () => {
    const before: readonly ArticleBlock[] = [
      { kind: "claim", markdown: "First.", citations: cite("Rust 2024 marks") },
      { kind: "claim", markdown: "Second.", citations: cite("released to date") },
    ];
    const after: readonly ArticleBlock[] = [
      before[0]!,
      { kind: "claim", markdown: "Second.", citations: cite("something else entirely") },
    ];

    expect(correctionStayedInScope(before, after, [finding])).toBe(false);
  });
});
