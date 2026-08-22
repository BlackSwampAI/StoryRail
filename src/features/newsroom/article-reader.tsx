import {
  articleBodyMarkdown,
  type ArticleGroundingMeasurement,
  type ArticleRevision,
} from "@/domain/editorial";

import { GroundingSummary } from "./grounding-summary";
import styles from "./newsroom-shell.module.css";
import { SafeMarkdown } from "./safe-markdown";

export function ArticleReader({
  revision,
  writerName,
  headingId,
  measurement,
}: Readonly<{
  revision: ArticleRevision;
  writerName: string;
  headingId: string;
  measurement: ArticleGroundingMeasurement;
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
      <SafeMarkdown markdown={articleBodyMarkdown(revision.blocks)} />
    </article>
  );
}
