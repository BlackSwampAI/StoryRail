import type { PriorReport, StoryId } from "@/domain/editorial";

export interface ArchiveSearchQuery {
  /** Free text, as an agent phrased it. The adapter decides how to match; nothing is a pattern. */
  readonly terms: string;
  readonly limit: number;
  /** The Story being worked on, so a run cannot find its own earlier reporting about itself. */
  readonly excludeStoryId: StoryId | null;
}

/**
 * What the newsroom has already published, searchable by its words.
 *
 * Only published work is in here. A draft, a Story in review, and a rejected Story are all
 * things the newsroom has not said, and an agent that could read them would be reasoning from
 * work no one approved.
 */
export interface ArchiveRepository {
  search(query: ArchiveSearchQuery): Promise<readonly PriorReport[]>;
}
