import type { ArticleBlock } from "@/domain/editorial";

/**
 * Headings a Writer produces sit under the post title, which WordPress renders as the `h1`, so
 * `h2` is the level that keeps a post's outline correct rather than repeating its top level.
 */
const HEADING_LEVEL = 2;

/**
 * WordPress stores prose as HTML, so a stray `<` in a sentence would swallow everything after it
 * up to the next `>` and a bare `&` would be read as the start of an entity. Three over-escaping
 * bugs in the grounding check were only ever found in live runs, so this escapes the three
 * characters that change meaning and nothing else — quotes are never in an attribute here.
 */
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Serialises a Revision's blocks as Gutenberg block markup.
 *
 * The delimiter comments are part of the format, not decoration: without them WordPress reads the
 * whole body as one Classic block and an editor can no longer move a paragraph. The structure
 * comes from the blocks themselves rather than from parsing `articleBodyMarkdown` back apart —
 * the structure was never lost, so re-deriving it could only introduce a disagreement.
 *
 * Inline markdown a model may have written inside a block — `**bold**`, a link — passes through as
 * literal text. StoryRail does not model inline marks, so half-parsing them would mean guessing at
 * what a Writer meant; showing exactly what was written is the honest reading.
 */
export function gutenbergBlocks(blocks: readonly ArticleBlock[]): string {
  return blocks
    .map((block) => {
      const text = escapeHtmlText(block.markdown);
      return block.kind === "heading"
        ? `<!-- wp:heading {"level":${HEADING_LEVEL}} -->\n<h${HEADING_LEVEL}>${text}</h${HEADING_LEVEL}>\n<!-- /wp:heading -->`
        : `<!-- wp:paragraph -->\n<p>${text}</p>\n<!-- /wp:paragraph -->`;
    })
    .join("\n\n");
}
