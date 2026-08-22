import type { ArticleCitation } from "@/domain/editorial";

import type { StoryInspection } from "@/application/story-inspection";

/**
 * Everything a reader needs to check a claim for themselves: the passage relied on, the Source
 * it came from, and which record of that Source was actually read. A citation the system cannot
 * resolve is reported as unresolved rather than quietly omitted, because a claim whose support
 * cannot be located is exactly the thing worth noticing.
 */
export interface CitationProvenance {
  readonly quote: string;
  readonly canonicalUrl: string | null;
  readonly title: string | null;
  readonly evidenceKind: "prepared" | "raw" | null;
}

export function citationProvenance(
  inspection: Pick<StoryInspection, "sources">,
  citation: ArticleCitation,
): CitationProvenance {
  const found = inspection.sources.find(({ source }) => source.id === citation.sourceId);
  if (found === undefined)
    return { quote: citation.quote, canonicalUrl: null, title: null, evidenceKind: null };

  const preparation = found.preparations.find(({ id }) => id === citation.evidenceId);
  const extraction = found.extractions.find(({ id }) => id === citation.evidenceId);
  const record = preparation ?? extraction;
  return {
    quote: citation.quote,
    canonicalUrl: found.source.canonicalUrl,
    title: record?.outcome === "succeeded" ? record.document.title : null,
    evidenceKind: record === undefined ? null : preparation === undefined ? "raw" : "prepared",
  };
}
