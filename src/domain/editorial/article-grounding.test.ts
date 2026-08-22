import { describe, expect, it } from "vitest";

import {
  sourceEvidencePreparationId,
  sourceId,
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
