import type { ArticleBlock } from "./article-types";
import type { SourceEvidencePreparationId, SourceExtractionId, SourceId } from "./types";

/**
 * The evidence a Revision is allowed to draw on, as the text that was actually read. Grounding
 * is checked against this rather than against a summary of it, because a quote that cannot be
 * found in what the Writer was shown is not support — whatever else it may be.
 */
export interface GroundingEvidence {
  readonly sourceId: SourceId;
  readonly evidenceId: SourceEvidencePreparationId | SourceExtractionId;
  readonly content: string;
}

/**
 * Why one citation could not be verified.
 *
 * Written as a runtime list with the type derived from it rather than as a bare union, because
 * a union alone gives a reader that must check a code at runtime nothing to import, and both the
 * database decoder and the browser answered that by typing the three codes out again.
 */
export const GROUNDING_FAILURE_CODES = [
  /** The citation points at evidence that was not part of this Assignment. */
  "CITATION_EVIDENCE_UNKNOWN",
  /** The citation names a Source that does not own the evidence it points at. */
  "CITATION_SOURCE_MISMATCH",
  /** The quoted passage does not appear in the evidence it is attributed to. */
  "CITATION_QUOTE_UNSUPPORTED",
] as const;

export type GroundingFailureCode = (typeof GROUNDING_FAILURE_CODES)[number];

export interface GroundingFinding {
  readonly blockIndex: number;
  readonly citationIndex: number;
  readonly code: GroundingFailureCode;
  readonly quote: string;
  readonly evidenceId: string;
}

export type VerifyArticleGroundingResult =
  { readonly ok: true } | { readonly ok: false; readonly findings: readonly GroundingFinding[] };

/**
 * Differences that are typography rather than content: a model re-wraps lines, straightens or
 * curls quotation marks, swaps dashes, or over-escapes while copying a passage accurately —
 * writing a line break as the two characters `\n`, or a quotation mark as `\"`. Normalising those away keeps the check about whether the words
 * are present, not about how they were rendered.
 *
 * Inline Markdown is the same kind of difference. Evidence arrives as Markdown, so a sentence in
 * the record may read `starts at **$2,499** for [education](https://…)` while the same sentence
 * on the page — and in any honest quotation of it — reads `starts at $2,499 for education`. The
 * asterisks and the address are how the passage was rendered, not words it contains, and a
 * Writer that reproduced them would be quoting the file rather than the source. Emphasis, code
 * ticks, link syntax and images are therefore removed; a link keeps its text, an image leaves
 * nothing, because an image carries no words a passage can quote.
 *
 * The same transformation is applied to the evidence, so a source that genuinely contains an
 * escape sequence still matches a quote that reproduces it — and so this cannot let a reworded
 * passage through. Both sides are reduced identically, which removes ways of writing the same
 * words and never makes two different sets of words equal.
 *
 * Nothing else is normalised. Case, spelling, word order, and punctuation beyond this list stay
 * significant, so a passage that was reworded rather than quoted still fails.
 */
function comparable(value: string): string {
  return (
    value
      // An image carries no words a passage can quote, so it leaves nothing behind.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      // A link reads as its text. The address is markup around the sentence, not part of it.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/(\*\*|__|\*|_|`)/g, "")
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”‟″]/g, '"')
      .replace(/[‐-―−]/g, "-")
      .replace(/\\[nrt]/g, " ")
      .replace(/\\(["'\\])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** A Markdown list, block quote, or fenced block continues the paragraph that introduces it. */
const CONTINUES_PARAGRAPH = /^\s*(?:[-*+]\s|\d+[.)]\s|>|```)/;

/**
 * A paragraph break is a boundary a quotation may not cross. Two sentences from either side of
 * one are contiguous in the file and not contiguous in the argument, so presenting them as a
 * single quoted passage misrepresents the source even though every word is present.
 *
 * A list is not such a boundary. The blank line between "the following are now stable:" and the
 * items it introduces is Markdown punctuation, not a change of subject, so the lead-in and its
 * list are folded back into one passage and may be quoted together.
 */
function passages(content: string): readonly string[] {
  const folded: string[] = [];
  for (const chunk of content.split(/\n\s*\n/)) {
    if (folded.length > 0 && CONTINUES_PARAGRAPH.test(chunk))
      folded[folded.length - 1] = `${folded.at(-1)}\n${chunk}`;
    else folded.push(chunk);
  }
  return folded.map(comparable).filter((passage) => passage.length > 0);
}

/**
 * Checks every citation on a Revision against the evidence it names.
 *
 * This is the point at which grounding stops being an instruction in a prompt and becomes a
 * property the system can establish for itself. A quote the Writer did not take from the
 * evidence cannot be made to pass by asserting it more confidently.
 */
export function verifyArticleGrounding(
  blocks: readonly ArticleBlock[],
  evidence: readonly GroundingEvidence[],
): VerifyArticleGroundingResult {
  const available = new Map(evidence.map((item) => [String(item.evidenceId), item]));
  const findings: GroundingFinding[] = [];

  blocks.forEach((block, blockIndex) => {
    block.citations.forEach((citation, citationIndex) => {
      const at = (code: GroundingFailureCode) => ({
        blockIndex,
        citationIndex,
        code,
        quote: citation.quote,
        evidenceId: String(citation.evidenceId),
      });
      const cited = available.get(String(citation.evidenceId));
      if (cited === undefined) {
        findings.push(at("CITATION_EVIDENCE_UNKNOWN"));
        return;
      }
      if (cited.sourceId !== citation.sourceId) {
        findings.push(at("CITATION_SOURCE_MISMATCH"));
        return;
      }
      const quoted = comparable(citation.quote);
      if (!passages(cited.content).some((passage) => passage.includes(quoted)))
        findings.push(at("CITATION_QUOTE_UNSUPPORTED"));
    });
  });

  return findings.length === 0 ? { ok: true } : { ok: false, findings };
}

/**
 * How much of a Revision rests on its evidence, and how much of it is the evidence restated.
 *
 * These answer two different questions, and a Revision can score badly on either. `groundedShare`
 * asks whether the article's assertions are supported. `derivedShare` asks whether the article
 * added anything: prose that is largely lifted from its sources is grounded and worthless, and a
 * system that reported only the first number would call that a success.
 */
export interface ArticleGroundingMeasurement {
  readonly claimBlocks: number;
  readonly contextBlocks: number;
  readonly headingBlocks: number;
  readonly citations: number;
  /**
   * Characters of cited prose as a share of all prose that asserts or explains, headings aside.
   * Weighted by length so that splitting one long claim into several does not improve the score.
   * `null` when the Revision contains no prose to weigh.
   */
  readonly groundedShare: number | null;
  /**
   * Share of the Revision's word sequences that also occur verbatim in its evidence. High values
   * mean the source has been restated rather than reported on. `null` when the Revision is too
   * short to sequence.
   */
  readonly derivedShare: number | null;
}

/**
 * Long enough that ordinary shared phrasing does not register, short enough to catch a sentence
 * carried over with a word changed.
 */
const SEQUENCE_WORDS = 8;

/** Emphasis and code markers differ between an Article and its evidence without changing words. */
function words(value: string): readonly string[] {
  return comparable(value)
    .toLowerCase()
    .replace(/[*_`#>]/g, "")
    .split(" ")
    .filter((word) => word.length > 0);
}

function sequences(value: string): ReadonlySet<string> {
  const spoken = words(value);
  const found = new Set<string>();
  for (let index = 0; index + SEQUENCE_WORDS <= spoken.length; index += 1)
    found.add(spoken.slice(index, index + SEQUENCE_WORDS).join(" "));
  return found;
}

export function measureArticleGrounding(
  blocks: readonly ArticleBlock[],
  evidence: readonly GroundingEvidence[],
): ArticleGroundingMeasurement {
  const counted = { claim: 0, context: 0, heading: 0 };
  let citations = 0;
  let citedCharacters = 0;
  let uncitedCharacters = 0;
  const prose: string[] = [];

  for (const block of blocks) {
    counted[block.kind] += 1;
    citations += block.citations.length;
    if (block.kind === "heading") continue;
    prose.push(block.markdown);
    if (block.kind === "claim") citedCharacters += block.markdown.trim().length;
    else uncitedCharacters += block.markdown.trim().length;
  }

  const weighed = citedCharacters + uncitedCharacters;
  const written = sequences(prose.join("\n\n"));
  const supplied = new Set<string>();
  for (const item of evidence)
    for (const sequence of sequences(item.content)) supplied.add(sequence);
  const carriedOver = [...written].filter((sequence) => supplied.has(sequence)).length;

  return {
    claimBlocks: counted.claim,
    contextBlocks: counted.context,
    headingBlocks: counted.heading,
    citations,
    groundedShare: weighed === 0 ? null : citedCharacters / weighed,
    derivedShare: written.size === 0 ? null : carriedOver / written.size,
  };
}

/**
 * Which of a Director's checks quote something the Article does not contain.
 *
 * A reviewer that must point at the passage it judges cannot return "well structured and
 * accurate" about work it did not read, and cannot request changes over a sentence it invented.
 * The Director is checked exactly as the Writer is, against the text it was given.
 */
export function unsupportedDirectorQuotes(
  review: {
    readonly checks: Readonly<Record<string, { readonly quoted: string }>>;
  },
  articleText: string,
): readonly string[] {
  const written = passages(articleText);
  return Object.entries(review.checks)
    .filter(([, check]) => {
      const quoted = comparable(check.quoted);
      return !written.some((passage) => passage.includes(quoted));
    })
    .map(([name]) => name);
}

/**
 * Whether a corrected draft changed only what it was asked to change.
 *
 * A correction turn sends the whole draft back, so nothing about the exchange stops a Writer
 * from rewriting blocks nobody objected to, or slipping in a new claim that happens to be
 * validly cited. Telling it not to is a prompt instruction; checking is an invariant.
 *
 * A block may be corrected in any way, including being restated as the Writer's own framing
 * where the claim cannot be supported. It may not be removed, and no block may be added: the
 * draft keeps its shape, and only the passages named in the findings may differ.
 */
export function correctionStayedInScope(
  before: readonly ArticleBlock[],
  after: readonly ArticleBlock[],
  findings: readonly GroundingFinding[],
): boolean {
  if (before.length !== after.length) return false;
  const permitted = new Set(findings.map(({ blockIndex }) => blockIndex));
  return before.every((block, index) => {
    if (permitted.has(index)) return true;
    const replacement = after[index];
    return replacement !== undefined && identicalBlocks(block, replacement);
  });
}

function identicalBlocks(left: ArticleBlock, right: ArticleBlock): boolean {
  return (
    left.kind === right.kind &&
    left.markdown === right.markdown &&
    left.citations.length === right.citations.length &&
    left.citations.every((citation, index) => {
      const other = right.citations[index];
      return (
        other !== undefined &&
        citation.sourceId === other.sourceId &&
        citation.evidenceId === other.evidenceId &&
        citation.quote === other.quote
      );
    })
  );
}
