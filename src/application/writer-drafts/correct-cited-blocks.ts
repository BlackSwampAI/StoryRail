import type { ZodType } from "zod";

import type { StructuredModel, StructuredModelResult } from "@/application/model";
import {
  correctionStayedInScope,
  verifyArticleGrounding,
  type ArticleBlock,
  type GroundingEvidence,
  type GroundingFinding,
} from "@/domain/editorial";

/** How the failed citations are described back to the Writer, in its own terms. */
const FINDING_EXPLANATIONS: Readonly<Record<GroundingFinding["code"], string>> = {
  CITATION_QUOTE_UNSUPPORTED:
    "this passage does not appear in the evidence record you cited — quote it exactly, cite the record it is actually in, or drop the claim",
  CITATION_SOURCE_MISMATCH:
    "this evidence record belongs to a different Source than the one you named — name the Source that owns it",
  CITATION_EVIDENCE_UNKNOWN:
    "this evidence record is not part of this Assignment — cite one that is, or drop the claim",
};

export function citationCorrectionRequest(
  blocks: readonly ArticleBlock[],
  findings: readonly GroundingFinding[],
): {
  readonly instruction: string;
  readonly unsupported: readonly {
    readonly claim: string;
    readonly quoted: string;
    readonly problem: string;
  }[];
} {
  return {
    instruction:
      'Your draft was refused because some claims cite evidence that does not support them. Return the whole draft again with those citations corrected. For each listed claim you may re-quote the passage exactly as it appears, cite the evidence record that actually contains it, or restate the sentence as your own framing with kind "context" and no citations. Return exactly the same number of blocks in the same order: every block not listed below must come back byte for byte unchanged, and this is checked.',
    unsupported: findings.map((finding) => ({
      claim: blocks[finding.blockIndex]?.markdown ?? "",
      quoted: finding.quote,
      problem: FINDING_EXPLANATIONS[finding.code],
    })),
  };
}

export type CorrectedBlocksResult =
  | {
      readonly ok: true;
      readonly blocks: readonly ArticleBlock[];
      /** What was wrong the first time, kept so a corrected draft never looks like a clean one. */
      readonly corrected: readonly GroundingFinding[] | null;
    }
  | { readonly ok: false; readonly result: StructuredModelResult<never> }
  | {
      readonly ok: false;
      readonly findings: readonly GroundingFinding[];
      /** Set where the correction rewrote blocks nobody objected to. */
      readonly outOfScope?: true;
    };

/**
 * Produces a draft whose citations hold up, allowing the Writer exactly one attempt to correct
 * its own unsupported citations.
 *
 * This is not a retry. A retry asks the same question again and hopes for a better roll; this
 * hands the Writer the specific findings against it — this passage is not in the record you
 * cited, this record belongs to a different Source — and asks it to fix those citations. It is
 * the feedback the Director already gives, applied to citations, and it is bounded to a single
 * attempt so a Writer that cannot support its claims is refused rather than ground down.
 *
 * A corrected draft is not recorded as a clean one: what was wrong the first time comes back
 * with it, so the record shows the Writer needed correcting.
 */
export async function correctedCitedBlocks<Output extends { readonly blocks: unknown }>(options: {
  readonly model: StructuredModel;
  readonly systemPrompt: string;
  readonly input: Readonly<Record<string, unknown>>;
  readonly schema: ZodType<Output>;
  readonly evidence: readonly GroundingEvidence[];
  readonly toBlocks: (output: Output) => readonly ArticleBlock[];
  readonly first: StructuredModelResult<Output>;
}): Promise<CorrectedBlocksResult> {
  if (!options.first.ok) return { ok: false, result: options.first };

  const blocks = options.toBlocks(options.first.output);
  const verified = verifyArticleGrounding(blocks, options.evidence);
  if (verified.ok) return { ok: true, blocks, corrected: null };

  const second = await options.model
    .generateStructured({
      systemPrompt: options.systemPrompt,
      input: { ...options.input, correction: citationCorrectionRequest(blocks, verified.findings) },
      schema: options.schema,
    })
    .catch(
      () =>
        ({
          ok: false,
          failure: { code: "MODEL_REQUEST_FAILED", retryable: true },
        }) as StructuredModelResult<Output>,
    );
  // A correction that itself fails to arrive leaves the original findings as the answer: the
  // draft was refused for those citations, and that is what the record should say.
  if (!second.ok) return { ok: false, findings: verified.findings };

  const corrected = options.toBlocks(second.output);
  // Checked before grounding: a correction that rewrote unrelated work is refused whatever its
  // citations look like, because the draft under review is no longer the one that was reviewed.
  if (!correctionStayedInScope(blocks, corrected, verified.findings))
    return { ok: false, findings: verified.findings, outOfScope: true };
  const recheck = verifyArticleGrounding(corrected, options.evidence);
  return recheck.ok
    ? { ok: true, blocks: corrected, corrected: verified.findings }
    : { ok: false, findings: recheck.findings };
}
