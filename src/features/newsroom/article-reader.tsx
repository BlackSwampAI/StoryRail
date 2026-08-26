"use client";

import { useState } from "react";

import { citationProvenance, type CitationProvenance } from "@/application/article-grounding";
import type { StoryInspection } from "@/application/story-inspection";
import {
  articleBodyMarkdown,
  type ArticleBlock,
  type ArticleGroundingMeasurement,
  type ArticleRevision,
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
 *
 * The mark is deliberately as quiet as the note on uncited prose. Shown as a filled button it
 * repeated down every paragraph and the piece could not be read at all, which is a way of losing
 * the attribution rather than showing it.
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
        className={styles.claimMark}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((shown) => !shown)}
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span> Attributed · {block.citations.length}{" "}
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

/**
 * The article's text as the system derived it, shown verbatim rather than re-rendered. A second
 * rendering could quietly disagree with the one the grounding check ran against; this is that
 * exact string, so what the operator reads and what was measured cannot come apart.
 */
function PlainArticle({ revision }: Readonly<{ revision: ArticleRevision }>) {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const text = articleBodyMarkdown(revision.blocks);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied the article text.");
    } catch {
      // The clipboard is refused in plenty of ordinary situations, so say so rather than
      // leaving the operator to wonder whether the copy took.
      setCopyStatus("The clipboard is unavailable. Select the text to copy it.");
    }
  }

  return (
    <div className={styles.articlePlain}>
      <p className={styles.articlePlainNote}>
        The article&apos;s text, derived from the same blocks a delivery is built from.
      </p>
      <button type="button" className={styles.citationToggle} onClick={() => void copy()}>
        Copy article text
      </button>
      {copyStatus ? (
        <p role="status" className={styles.articlePlainNote}>
          {copyStatus}
        </p>
      ) : null}
      <pre className={styles.articlePlainText}>{text}</pre>
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
  // Annotated is the default: opening a Story is editorial work, and reading it as prose is the
  // deliberate act rather than the other way round.
  const [plain, setPlain] = useState(false);
  return (
    <article className={styles.articleReader} aria-labelledby={headingId}>
      <header className={styles.articleHeader}>
        <p className={styles.currentTaskLabel}>Current article</p>
        <h2 id={headingId}>{revision.headline}</h2>
        {revision.dek ? <p className={styles.articleDek}>{revision.dek}</p> : null}
        <p className={styles.articleByline}>
          Revision {revision.revisionNumber} · {writerName}
        </p>
        <div className={styles.articleViewToggle} role="group" aria-label="Article view">
          <button
            type="button"
            className={styles.articleViewOption}
            aria-pressed={!plain}
            onClick={() => setPlain(false)}
          >
            Annotated
          </button>
          <button
            type="button"
            className={styles.articleViewOption}
            aria-pressed={plain}
            onClick={() => setPlain(true)}
          >
            Plain text
          </button>
        </div>
      </header>
      {plain ? (
        <PlainArticle revision={revision} />
      ) : (
        <>
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
        </>
      )}
    </article>
  );
}
