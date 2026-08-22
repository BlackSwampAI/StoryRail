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

export type GroundingFailureCode =
  /** The citation points at evidence that was not part of this Assignment. */
  | "CITATION_EVIDENCE_UNKNOWN"
  /** The citation names a Source that does not own the evidence it points at. */
  | "CITATION_SOURCE_MISMATCH"
  /** The quoted passage does not appear in the evidence it is attributed to. */
  | "CITATION_QUOTE_UNSUPPORTED";

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
 * curls quotation marks, and swaps dashes while copying a passage accurately. Normalising those
 * away keeps the check about whether the words are present, not about how they were rendered.
 *
 * Nothing else is normalised. Case, spelling, word order, and punctuation beyond this list stay
 * significant, so a passage that was reworded rather than quoted still fails.
 */
function comparable(value: string): string {
  return value
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
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
