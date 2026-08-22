import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { StructuredModel } from "@/application/model";
import {
  sourceEvidencePreparationId,
  sourceId,
  type ArticleBlock,
  type GroundingEvidence,
} from "@/domain/editorial";

import { citationCorrectionRequest, correctedCitedBlocks } from "./correct-cited-blocks";

const SOURCE = sourceId("source-correct");
const EVIDENCE = sourceEvidencePreparationId("prepared-correct");
const evidence: readonly GroundingEvidence[] = [
  { sourceId: SOURCE, evidenceId: EVIDENCE, content: "The release shipped on Tuesday." },
];
const schema = z.object({ blocks: z.array(z.unknown()) }).strict();

const claim = (quote: string): readonly ArticleBlock[] => [
  {
    kind: "claim",
    markdown: "The release shipped.",
    citations: [{ sourceId: SOURCE, evidenceId: EVIDENCE, quote }],
  },
];

function run(second?: { readonly quote: string } | "fails") {
  const generateStructured = vi.fn(async () =>
    second === undefined || second === "fails"
      ? { ok: false as const, failure: { code: "MODEL_REQUEST_FAILED" as const, retryable: true } }
      : { ok: true as const, output: { blocks: [second.quote] } },
  );
  const model = { generateStructured } as unknown as StructuredModel;
  return { generateStructured, model };
}

const settle = (
  model: StructuredModel,
  firstQuote: string,
  toBlocks: (output: { blocks: unknown[] }) => readonly ArticleBlock[],
) =>
  correctedCitedBlocks({
    model,
    systemPrompt: "system",
    input: { story: {} },
    schema: schema as never,
    evidence,
    toBlocks: toBlocks as never,
    first: { ok: true, output: { blocks: [firstQuote] } as never },
  });

const asBlocks = (output: { blocks: unknown[] }) => claim(String(output.blocks[0]));

describe("giving the Writer one chance to correct its citations", () => {
  it("does not ask again when the first draft is already supported", async () => {
    const { model, generateStructured } = run();

    await expect(settle(model, "The release shipped", asBlocks)).resolves.toMatchObject({
      ok: true,
      corrected: null,
    });
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("hands back the specific findings rather than asking the same question again", async () => {
    // A retry hopes for a better roll. This says which citation is wrong and why.
    const { model, generateStructured } = run({ quote: "The release shipped" });

    await settle(model, "Never written anywhere", asBlocks);

    const sent = (
      generateStructured.mock.calls as unknown as [
        { input: { correction: { unsupported: { problem: string; quoted: string }[] } } },
      ][]
    )[0]?.[0];
    expect(sent?.input.correction.unsupported).toEqual([
      {
        claim: "The release shipped.",
        quoted: "Never written anywhere",
        problem: expect.stringContaining("does not appear in the evidence record you cited"),
      },
    ]);
  });

  it("accepts a corrected draft and records what was wrong the first time", async () => {
    // A corrected draft must never be recorded as a clean one.
    const { model } = run({ quote: "The release shipped" });

    await expect(settle(model, "Never written anywhere", asBlocks)).resolves.toMatchObject({
      ok: true,
      corrected: [{ code: "CITATION_QUOTE_UNSUPPORTED", quote: "Never written anywhere" }],
    });
  });

  it("refuses after one correction rather than grinding the Writer down", async () => {
    const { model, generateStructured } = run({ quote: "Still not in the evidence" });

    await expect(settle(model, "Never written anywhere", asBlocks)).resolves.toMatchObject({
      ok: false,
      findings: [{ quote: "Still not in the evidence" }],
    });
    expect(generateStructured).toHaveBeenCalledOnce();
  });

  it("keeps the original findings when the correction itself never arrives", async () => {
    const { model } = run("fails");

    await expect(settle(model, "Never written anywhere", asBlocks)).resolves.toMatchObject({
      ok: false,
      findings: [{ quote: "Never written anywhere" }],
    });
  });

  it("explains each kind of failure in the Writer's own terms", () => {
    const request = citationCorrectionRequest(claim("Absent"), [
      {
        blockIndex: 0,
        citationIndex: 0,
        code: "CITATION_SOURCE_MISMATCH",
        quote: "Absent",
        evidenceId: "prepared-correct",
      },
    ]);

    expect(request.unsupported[0]?.problem).toContain("belongs to a different Source");
    expect(request.instruction).toContain("Do not add new claims");
  });
});
