import type { ArticleBlock } from "@/domain/editorial";

export interface EmDashPortableTextBlock {
  readonly _type: "block";
  readonly _key: string;
  readonly style: "normal" | "h2";
  readonly children: readonly [
    {
      readonly _type: "span";
      readonly _key: string;
      readonly text: string;
      readonly marks: readonly [];
    },
  ];
  readonly markDefs: readonly [];
}

/**
 * EmDash stores rich text as Portable Text. StoryRail deliberately preserves each source block's
 * text verbatim: inline Markdown is not parsed because ArticleBlock has no inline-mark model.
 */
export function emdashPortableText(
  blocks: readonly ArticleBlock[],
): readonly EmDashPortableTextBlock[] {
  return blocks.map((block, index) => ({
    _type: "block",
    _key: `storyrail-block-${index}`,
    style: block.kind === "heading" ? "h2" : "normal",
    children: [{ _type: "span", _key: `storyrail-span-${index}`, text: block.markdown, marks: [] }],
    markDefs: [],
  }));
}
