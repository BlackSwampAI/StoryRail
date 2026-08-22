import {
  measureArticleGrounding,
  type ArticleGroundingMeasurement,
  type ArticleRevision,
  type GroundingEvidence,
} from "@/domain/editorial";

import type { StoryInspection } from "@/application/story-inspection";

/**
 * The evidence a Revision was written against, as recorded rather than as it stands now.
 *
 * A Story can gain Sources after an Article is drafted, so measuring against everything attached
 * today would credit a Revision with evidence its Writer never saw. The Writer's own run records
 * exactly which evidence it was given, and that is what the Revision is answerable to.
 */
export function evidenceBehindRevision(
  inspection: Pick<StoryInspection, "agentRuns" | "sources">,
  revision: Pick<ArticleRevision, "agentRunId">,
): readonly GroundingEvidence[] {
  const run = inspection.agentRuns.find((candidate) => candidate.id === revision.agentRunId);
  if (run === undefined || run.role !== "writer") return [];

  const resolved: GroundingEvidence[] = [];
  for (const reference of run.input.evidence) {
    const source = inspection.sources.find(({ source }) => source.id === reference.sourceId);
    if (source === undefined) continue;
    const record =
      source.preparations.find((preparation) => preparation.id === reference.evidenceId) ??
      source.extractions.find((extraction) => extraction.id === reference.evidenceId);
    if (record?.outcome !== "succeeded") continue;
    resolved.push({
      sourceId: reference.sourceId,
      evidenceId: reference.evidenceId,
      content: record.document.content,
    });
  }
  return resolved;
}

/**
 * Measures a Revision against the evidence its Writer was given. Derived on demand rather than
 * stored: both inputs are immutable once written, so the answer cannot drift, and every Revision
 * already in the database can be measured — including those written before citations existed,
 * which is precisely the comparison worth being able to make.
 */
export function measureRevisionGrounding(
  inspection: Pick<StoryInspection, "agentRuns" | "sources">,
  revision: Pick<ArticleRevision, "agentRunId" | "blocks">,
): ArticleGroundingMeasurement {
  return measureArticleGrounding(revision.blocks, evidenceBehindRevision(inspection, revision));
}
