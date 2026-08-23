import { articleBodyMarkdown } from "./article";
import type { ArticleBlock } from "./article-types";
import { MAXIMUM_ARCHIVE_EXCERPT_CHARACTERS, type PriorReport } from "./archive-types";

/**
 * Enough of a prior report to recognise what it covered.
 *
 * The cut lands on a paragraph boundary wherever one falls within the limit, so an excerpt never
 * stops mid-sentence and never joins two paragraphs that were separate in the published work.
 * That is the same boundary the grounding check treats as significant, kept here so an agent
 * reading the archive is shown passages the way the Writer would have to quote them.
 */
export function priorReportExcerpt(
  blocks: readonly ArticleBlock[],
  limit: number = MAXIMUM_ARCHIVE_EXCERPT_CHARACTERS,
): string {
  const paragraphs = articleBodyMarkdown(blocks).split("\n\n");
  const kept: string[] = [];
  let length = 0;
  for (const paragraph of paragraphs) {
    const added = kept.length === 0 ? paragraph.length : length + 2 + paragraph.length;
    if (added > limit) break;
    kept.push(paragraph);
    length = added;
  }
  if (kept.length > 0) return kept.join("\n\n");

  // A first paragraph longer than the whole allowance still has to be shown as something. It is
  // cut at a word boundary and marked as cut, so nothing reads as a complete passage when it is
  // not one.
  const opening = paragraphs[0] ?? "";
  const cut = opening.slice(0, limit);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > 0 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/**
 * A prior report as an agent is shown it.
 *
 * It says plainly that this is the newsroom's own earlier work rather than evidence, because the
 * distinction is what keeps a newsroom from citing itself into a circle. The Sources behind the
 * earlier reporting are named so a Researcher can return to the same ground and retrieve it
 * afresh, rather than treating the summary as a substitute for reading it.
 */
export function describePriorReport(report: PriorReport): string {
  const sources =
    report.sources.length === 0
      ? "No Sources are recorded behind it."
      : `It reported from: ${report.sources.map(({ url }) => url).join(", ")}`;
  return [
    `StoryRail published "${report.headline}" at ${report.publishedAt} (Story ${report.storyId}, revision ${report.revisionNumber}).`,
    report.dek === null ? null : report.dek,
    sources,
    "Opening of that report:",
    priorReportExcerpt(report.blocks),
  ]
    .filter((line): line is string => line !== null)
    .join("\n\n");
}
