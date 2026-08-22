import { articleBodyMarkdown, type ArticleRevision } from "@/domain/editorial";

import styles from "./newsroom-shell.module.css";
import { SafeMarkdown } from "./safe-markdown";

export function ArticleReader({
  revision,
  writerName,
  headingId,
}: Readonly<{ revision: ArticleRevision; writerName: string; headingId: string }>) {
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
      <SafeMarkdown markdown={articleBodyMarkdown(revision.blocks)} />
    </article>
  );
}
