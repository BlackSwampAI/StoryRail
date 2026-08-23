import type { ArticleBlock } from "./article-types";
import type { ArticleRevisionId, SourceId, StoryId } from "./types";

/**
 * How many prior reports one lookup may return. Small on purpose: an archive lookup is meant to
 * tell an agent what the newsroom has already said about a subject, not to become a second body
 * of reading that crowds out the evidence.
 */
export const MAXIMUM_ARCHIVE_RESULTS = 5;

/** How much of a prior report is shown. Enough to recognise the coverage, not to reuse it. */
export const MAXIMUM_ARCHIVE_EXCERPT_CHARACTERS = 1_200;

/** A Source the earlier reporting rested on, so a Researcher can go back to the same ground. */
export interface PriorReportSource {
  readonly sourceId: SourceId;
  readonly url: string;
  readonly relevance: string;
}

/**
 * Something the newsroom has already published.
 *
 * It carries no evidence identifier, and that absence is the point. A prior report is what this
 * newsroom said, not proof that it was so, and the grounding check refuses a citation naming a
 * record that is not evidence on the Assignment. Prior reporting therefore informs work without
 * ever being able to support a claim.
 */
export interface PriorReport {
  readonly storyId: StoryId;
  readonly revisionId: ArticleRevisionId;
  readonly revisionNumber: number;
  readonly headline: string;
  readonly dek: string | null;
  readonly publishedAt: string;
  readonly blocks: readonly ArticleBlock[];
  readonly sources: readonly PriorReportSource[];
}
