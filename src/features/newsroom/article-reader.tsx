"use client";

import { useState } from "react";

import { citationProvenance, type CitationProvenance } from "@/application/article-grounding";
import type { StoryInspection } from "@/application/story-inspection";
import type {
  ArticleBlock,
  ArticleGroundingMeasurement,
  ArticleRevision,
} from "@/domain/editorial";

import { GroundingSummary } from "./grounding-summary";
import styles from "./newsroom-shell.module.css";
import { SafeMarkdown } from "./safe-markdown";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Support({ provenance }: Readonly<{ provenance: CitationProvenance }>) {
  return (
    <li>
      <blockquote>{provenance.quote}</blockquote>
      <p className={styles.citationSource}>
        {provenance.canonicalUrl === null ? (
          <span>Source unavailable on this Story</span>
        ) : (
          <a href={provenance.canonicalUrl} target="_blank" rel="noopener noreferrer">
            {provenance.title ?? hostOf(provenance.canonicalUrl)}
          </a>
        )}
        {provenance.evidenceKind === null ? (
          <span> · evidence record not found</span>
        ) : (
          <span> · {provenance.evidenceKind} evidence</span>
        )}
      </p>
    </li>
  );
}

/**
 * A claim carries the passage it rests on, one click away. Attribution that a reader cannot
 * follow is a claim about rigour rather than a demonstration of it, so the support is part of
 * the Article rather than buried in an audit panel.
 */
function Claim({
  block,
  inspection,
  index,
}: Readonly<{ block: ArticleBlock; inspection: Pick<StoryInspection, "sources">; index: number }>) {
  const [open, setOpen] = useState(false);
  const panelId = `claim-support-${index}`;
  return (
    <div className={styles.articleClaim}>
      <SafeMarkdown markdown={block.markdown} />
      <button
        type="button"
        className={styles.citationToggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((shown) => !shown)}
      >
        {open ? "Hide" : "Show"} {block.citations.length}{" "}
        {block.citations.length === 1 ? "source" : "sources"}
      </button>
      {open ? (
        <ol id={panelId} className={styles.citationList}>
          {block.citations.map((citation, position) => (
            <Support
              key={`${citation.evidenceId}-${position}`}
              provenance={citationProvenance(inspection, citation)}
            />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function ArticleReader({
  revision,
  writerName,
  headingId,
  measurement,
  inspection,
}: Readonly<{
  revision: ArticleRevision;
  writerName: string;
  headingId: string;
  measurement: ArticleGroundingMeasurement;
  inspection: Pick<StoryInspection, "sources">;
}>) {
  return (
    <article className={styles.articleReader} aria-labelledby={headingId}>
      <header className={styles.articleHeader}>
        <p className={styles.currentTaskLabel}>Current article</p>
        <h2 id={headingId}>{revision.headline}</h2>
        {revision.dek ? <p className={styles.articleDek}>{revision.dek}</p> : null}
        <p className={styles.articleByline}>
          Revision {revision.revisionNumber} · {writerName}
        </p>
      </header>
      <GroundingSummary measurement={measurement} />
      <div className={styles.articleBody}>
        {revision.blocks.map((block, index) => {
          const key = `${index}-${block.kind}`;
          if (block.kind === "heading")
            return (
              <h3 key={key} className={styles.articleSection}>
                {block.markdown}
              </h3>
            );
          if (block.kind === "claim")
            return <Claim key={key} block={block} inspection={inspection} index={index} />;
          // Uncited prose is labelled rather than left to pass as reporting.
          return (
            <div key={key} className={styles.articleContext}>
              <SafeMarkdown markdown={block.markdown} />
              <p className={styles.contextLabel}>Writer&apos;s own framing · not attributed</p>
            </div>
          );
        })}
      </div>
    </article>
  );
}
